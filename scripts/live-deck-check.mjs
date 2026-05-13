const engine = process.argv[2] || 'gemini-cli';

if (process.env.PAPER_STUDIO_ALLOW_LIVE !== '1') {
  console.log(`Live ${engine} deck check is disabled. Set PAPER_STUDIO_ALLOW_LIVE=1 after confirming CLI/provider use.`);
  process.exit(0);
}

console.log(`Run the browser flow, choose ${engine}, and click Generate to exercise the live deck planner.`);
