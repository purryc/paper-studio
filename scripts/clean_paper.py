#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np


MIN_PAPER_AREA_RATIO = 0.08
MAX_PAPER_AREA_RATIO = 0.82


def order_points(points):
    rect = np.zeros((4, 2), dtype="float32")
    summed = points.sum(axis=1)
    diff = np.diff(points, axis=1)
    rect[0] = points[np.argmin(summed)]
    rect[2] = points[np.argmax(summed)]
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def warp_paper(image, contour):
    rect = order_points(contour.reshape(4, 2).astype("float32"))
    tl, tr, br, bl = rect
    width_a = math.dist(br, bl)
    width_b = math.dist(tr, tl)
    height_a = math.dist(tr, br)
    height_b = math.dist(tl, bl)
    max_width = max(1, int(max(width_a, width_b)))
    max_height = max(1, int(max(height_a, height_b)))
    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, matrix, (max_width, max_height))


def is_reliable_perspective_quad(quad, image):
    if len(quad) != 4:
        return False

    height, width = image.shape[:2]
    x, y, w, h = cv2.boundingRect(quad)
    if w <= 0 or h <= 0:
        return False

    # Desk View often sees curled paper edges, hands, or clipboard rims.
    # If the inferred quad touches the frame edge, perspective warp is usually
    # less trustworthy than a stable bounding crop.
    edge_margin = max(4, int(min(width, height) * 0.015))
    if x <= edge_margin or y <= edge_margin:
        return False
    if x + w >= width - edge_margin or y + h >= height - edge_margin:
        return False

    fill_ratio = cv2.contourArea(quad) / float(w * h)
    if fill_ratio < 0.82:
        return False

    rect = order_points(quad.reshape(4, 2).astype("float32"))
    tl, tr, br, bl = rect
    widths = [math.dist(br, bl), math.dist(tr, tl)]
    heights = [math.dist(tr, br), math.dist(tl, bl)]
    if min(widths) < 80 or min(heights) < 80:
        return False
    if min(widths) / max(widths) < 0.72:
        return False
    if min(heights) / max(heights) < 0.72:
        return False

    output_aspect = max(widths) / max(heights)
    if not (0.55 <= output_aspect <= 2.4):
        return False

    return True


def clamp_box(x, y, w, h, image):
    height, width = image.shape[:2]
    padding = int(max(width, height) * 0.015)
    left = max(0, x - padding)
    top = max(0, y - padding)
    right = min(width, x + w + padding)
    bottom = min(height, y + h + padding)
    return left, top, right - left, bottom - top


def crop_box(image, box):
    x, y, w, h = box
    return image[y : y + h, x : x + w]


def scale_contour(contour, scale):
    return (contour / scale).astype("float32")


def contour_box(contour, scale, image):
    x, y, w, h = cv2.boundingRect(contour)
    x = int(x / scale)
    y = int(y / scale)
    w = int(w / scale)
    h = int(h / scale)
    return clamp_box(x, y, w, h, image)


def find_paper_contour(image):
    original_height, original_width = image.shape[:2]
    scale = 1200.0 / max(original_width, original_height)
    if scale < 1:
        small = cv2.resize(image, (int(original_width * scale), int(original_height * scale)))
    else:
        small = image.copy()
        scale = 1.0

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 140)
    edges = cv2.dilate(edges, np.ones((3, 3), dtype=np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]

    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        area = cv2.contourArea(approx)
        frame_area = small.shape[0] * small.shape[1]
        if len(approx) == 4 and area > frame_area * 0.18 and is_reliable_perspective_quad(approx, small):
            return (approx / scale).astype("float32")

    return None


def find_paper_focus(image):
    original_height, original_width = image.shape[:2]
    scale = 1200.0 / max(original_width, original_height)
    if scale < 1:
        small = cv2.resize(image, (int(original_width * scale), int(original_height * scale)))
    else:
        small = image.copy()
        scale = 1.0

    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]

    frame_area = small.shape[0] * small.shape[1]
    candidates = []
    thresholds = [
        # Strict white paper first. This avoids merging the sheet with beige desks
        # or colored clipboards when Desk View has warm lighting.
        (185, 40),
        (178, 50),
        (170, 60),
    ]
    for min_value, max_saturation in thresholds:
        paper_mask = np.zeros(gray.shape, dtype=np.uint8)
        paper_mask[(value > min_value) & (saturation < max_saturation)] = 255
        paper_mask = cv2.morphologyEx(paper_mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8), iterations=1)
        paper_mask = cv2.morphologyEx(paper_mask, cv2.MORPH_CLOSE, np.ones((17, 17), np.uint8), iterations=2)
        contours, _ = cv2.findContours(paper_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            area = cv2.contourArea(contour)
            x, y, w, h = cv2.boundingRect(contour)
            if w <= 0 or h <= 0:
                continue
            area_ratio = area / frame_area
            rectangularity = area / float(w * h)
            aspect_ratio = w / float(h)
            if not (MIN_PAPER_AREA_RATIO <= area_ratio <= MAX_PAPER_AREA_RATIO):
                continue
            if rectangularity < 0.62:
                continue
            if not (0.55 <= aspect_ratio <= 2.4):
                continue
            score = (rectangularity * 2.0) + area_ratio
            candidates.append((score, contour))

    if not candidates:
        return None

    candidates = [contour for _, contour in sorted(candidates, key=lambda item: item[0], reverse=True)]
    for contour in candidates[:6]:
        hull = cv2.convexHull(contour)
        peri = cv2.arcLength(hull, True)
        approx = cv2.approxPolyDP(hull, 0.03 * peri, True)
        if len(approx) == 4 and is_reliable_perspective_quad(approx, small):
            contour = scale_contour(approx, scale)
            return {
                "method": "perspective",
                "image": warp_paper(image, contour),
                "box": contour_box(approx, scale, image),
                "usedContour": True,
            }

    contour = candidates[0]
    box = contour_box(contour, scale, image)
    return {
        "method": "bounding-box",
        "image": crop_box(image, box),
        "box": box,
        "usedContour": False,
    }


def enhance_lines(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    background = cv2.medianBlur(cv2.dilate(gray, np.ones((9, 9), np.uint8)), 31)
    normalized = cv2.divide(gray, background, scale=255)
    normalized = cv2.GaussianBlur(normalized, (3, 3), 0)
    threshold = cv2.adaptiveThreshold(
        normalized,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        35,
        11,
    )
    return cv2.cvtColor(threshold, cv2.COLOR_GRAY2BGR)


def main():
    if len(sys.argv) not in (3, 4):
        print(json.dumps({"status": "failed", "error": "Usage: clean_paper.py <raw_image> <output_image> [paper_crop_image]"}))
        return 2

    raw_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    crop_path = Path(sys.argv[3]) if len(sys.argv) == 4 else None
    image = cv2.imread(str(raw_path))
    if image is None:
        print(json.dumps({"status": "failed", "error": "Could not read image"}))
        return 1

    warning = None
    working = image
    focus = find_paper_focus(image)
    paper_focus_method = "none"
    paper_bounding_box = None
    used_contour = False
    if focus is not None:
        working = focus["image"]
        used_contour = focus["usedContour"]
        paper_focus_method = focus["method"]
        x, y, w, h = focus["box"]
        paper_bounding_box = {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
    else:
        contour = find_paper_contour(image)
        if contour is not None:
            working = warp_paper(image, contour)
            used_contour = True
            paper_focus_method = "perspective"
            x, y, w, h = clamp_box(*cv2.boundingRect(contour.astype("int32")), image)
            paper_bounding_box = {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}
        else:
            warning = "Paper focus was not found. Kept the raw frame and applied best-effort line cleanup."

    cleaned = enhance_lines(working)
    if crop_path is not None:
        crop_path.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(crop_path), working):
            print(json.dumps({"status": "failed", "error": "Could not write paper crop image"}))
            return 1
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ok = cv2.imwrite(str(output_path), cleaned)
    if not ok:
        print(json.dumps({"status": "failed", "error": "Could not write cleaned image"}))
        return 1

    print(
        json.dumps(
            {
                "status": "completed",
                "usedContour": used_contour,
                "warning": warning,
                "width": int(cleaned.shape[1]),
                "height": int(cleaned.shape[0]),
                "paperFocusUsed": paper_focus_method != "none",
                "paperFocusMethod": paper_focus_method,
                "paperBoundingBox": paper_bounding_box,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
