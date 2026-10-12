import { startBot } from "./bot";
import { startImapWorker } from "./imap-worker";
import { startMemberCleanupWorker } from "./member-cleanup";

async function main() {
	await startBot();
	startImapWorker();
	startMemberCleanupWorker();
}

main().catch((error) => {
	console.error("worker failed to start", error);
	process.exit(1);
});