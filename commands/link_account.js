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
  name: "link_account",
  data: new SlashCommandBuilder()
    .setName("link_account")
    .setDescription("Link your discord account to a WB games account.")
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the player")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("platform")
          .setDescription("The platform to search on (if not added, defaults to WB Games)")
          .setRequired(false)
          .addChoices(
            { name: "WB Games", value: "wb_network" },
            { name: "Twitch", value: "twitch" },
            { name: "Play Station", value: "ps4" },
            { name: "Discord", value: "discord" },
            { name: "Google", value: "google" },
            { name: "Steam", value: "steam" },
            { name: "Epic Games", value: "epic" },
            { name: "Xbox", value: "xb1" }
          )
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let name = interaction.options.getString("user")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"

    try {
      await interaction.deferReply({ ephemeral: true })
    }
    catch (e) {
      console.error(e)
      return;
    }

    if (!config.enableMongoDatabase)
      return interaction.editReply("This feature is not enabled.")

    try {
      let user
      try {
        if (name) {
          user = (await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform))
        }
        // else {
        //   let cursor = null
        //   while (!user) {
        //     let results = (await interaction.client.MultiversusClient.searchByUsername(interaction.user.username, 100, cursor, "discord"))
        //     let users = results.results
        //     let temp = users.find(u => u.result.account.identity.alternate.discord[0].id == interaction.user.id)
        //     if (temp) {
        //       user = temp.result
        //       name = temp.result.account.identity.alternate.wb_network[0].username
        //       break;
        //     }
        //     else if (results.cursor == null) {
        //       interaction.editReply("Couldn't find a user linked to your discord account. Either link your WB Games account, or supply a username to search for.")
        //       return;
        //     }
        //     cursor = results.cursor
        //   }
        // }
      }
      catch (e) {
        if (e.code == 401) {
          return interaction.editReply({ content: "Key refreshed. Please try again.", ephemeral: true })
        }
        else if (e.code == 503) {
          return interaction.editReply({ content: "Maintenance mode is activated. Please try again later.", ephemeral: true })
        }
        else {
          return interaction.editReply({ content: "An unknown error has occured.", ephemeral: true })
        }
      }

      if (!user) {
        interaction.editReply({ content: "User not found.", ephemeral: true })
        return
      }

      let id = user.account_id

      await interaction.client.db.collection('linkedUsers').updateOne({ _id: interaction.user.id }, { $set: { wbId: id } }, { upsert: true })

      interaction.editReply({ content: "Account linked.", ephemeral: true })
    }
    catch (e) {
      // console.error(e)
      if (e.code == 401) {
        return interaction.editReply({ content: "Key refreshed. Please try again.", ephemeral: true })
      }
    }
  }
}