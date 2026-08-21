import { prisma } from "@chudaco/db";
import { BillingStatus } from "@chudaco/db";
import { ChatInputCommandInteraction, Client, Events, GatewayIntentBits, SlashCommandBuilder } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function syncSlashCommands(): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId || !client.application) {
    return;
  }

  const balanceCommand = new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Show your current PAS balance");

  await client.application.commands.set([balanceCommand.toJSON()], guildId);
}

async function handleBalance(interaction: ChatInputCommandInteraction): Promise<void> {
  const discordId = interaction.user.id;

  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });

  if (!user) {
    await interaction.reply({
      ephemeral: true,
      content: "No ChudACO records found for your Discord account yet.",
    });
    return;
  }

  const summary = await prisma.billingEntry.aggregate({
    where: {
      userId: user.id,
      status: { in: [BillingStatus.due, BillingStatus.overdue] },
    },
    _sum: { feeAmount: true },
  });

  const total = Number(summary._sum.feeAmount ?? 0).toFixed(2);

  await interaction.reply({
    ephemeral: true,
    content: `Your current PAS balance is $${total}.`,
  });
}

export async function startBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN");
  }

  client.once(Events.ClientReady, async () => {
    const tag = client.user?.tag ?? "unknown-user";
    console.log(`ChudACO bot connected as ${tag}`);

    await syncSlashCommands();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === "balance") {
      await handleBalance(interaction);
    }
  });

  await client.login(token);
}