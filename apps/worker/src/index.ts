import { startBot } from "./bot";
import { startImapWorker } from "./imap-worker";

async function main() {
	await startBot();
	startImapWorker();
}

main().catch((error) => {
	console.error("worker failed to start", error);
	process.exit(1);
});