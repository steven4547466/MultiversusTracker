const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CharacterData } = require("multiversus.js")

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

module.exports = {
  name: "unlink_account",
  data: new SlashCommandBuilder()
    .setName("unlink_account")
    .setDescription("Unlink your WB games account."),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    await interaction.client.db.collection('linkedUsers').deleteOne({ _id: interaction.user.id })

    interaction.editReply({ content: "Account unlinked.", ephemeral: true })
  }
}