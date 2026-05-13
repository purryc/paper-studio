if (process.env.PAPER_STUDIO_ALLOW_LIVE !== '1') {
  console.log('Live LibTV check is disabled. Set PAPER_STUDIO_ALLOW_LIVE=1 after confirming spend/quota use.');
  process.exit(0);
}

console.log('Run the browser flow and click Generate to exercise the live LibTV provider.');
