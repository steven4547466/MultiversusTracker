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
  name: "getrank",
  data: new SlashCommandBuilder()
    .setName("getrank")
    .setDescription("Get the rank of a user.")
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of rank to get")
          .setRequired(true)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
          )
    )
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the player")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("character")
          .setDescription("The character to check (if not added, gets overall rank)")
          .setRequired(false)
          .addChoices(...(buildCharacterChoices()))
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
    let type = interaction.options.getString("type")
    let character = interaction.options.getString("character")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    if (!character) {
      try {
        let user
        try {
          if (name) {
            let search = (await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform))
            if (search) {
              user = (await interaction.client.MultiversusClient.getAccount(search.account_id))
            }
          }
          else {
            let wbId = await interaction.client.utils.getLinkedAccount(interaction.user)
            if (!wbId) return interaction.editReply("You must have a linked account to use commands without search queries.")
            user = (await interaction.client.MultiversusClient.getAccount(wbId))
            name = interaction.user.username
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
            return interaction.editReply("Key refreshed. Please try again.")
          }
          else if (e.code == 503) {
            return interaction.editReply("Maintenance mode is activated. Please try again later.")
          }
          else {
            return interaction.editReply("An unknown error has occured.")
          }
        }

        if (!user) {
          interaction.editReply("User not found.")
          return
        }

        let profile = await interaction.client.MultiversusClient.getProfile(user.id)
        let data = await interaction.client.MultiversusClient.getProfileLeaderboard(user.id, type)
        let mmr = data.score
        let rank = data.rank

        let shuffleData = profile.server_data[`${type}shuffle`]

        if (!shuffleData) {
          interaction.editReply("Data not found. Try again later")
          return
        }

        let highestKey = `${Object.keys(shuffleData).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`

        // require("fs").writeFileSync("./data.json", JSON.stringify(profile, null, 4))

        let embed = new EmbedBuilder()
          .setTitle(`${name}'s ${type} Rank`)
          .setColor("#00ff00")
          .addFields(
            { name: "Rank", value: `${rank}` },
            { name: "MMR", value: `${Math.round(mmr)}` },
            {
              name: "Top Rated Character",
              value: `${Object.entries(CharacterData).find((entry) => entry[1].id == shuffleData[highestKey].topRating.character)[1].displayName}`
            },
          )
          .setThumbnail(`https://oliy.is-just-a.dev/mvs_characters/${shuffleData[highestKey].topRating.character}.png`)
          .setFooter({ text: "Created by Steven4547466#1407", iconURL: interaction.client.user.displayAvatarURL() });

        interaction.editReply({ embeds: [embed] })
      }
      catch (e) {
        if (e.code == 401) {
          return interaction.editReply("Key refreshed. Please try again.")
        }
      }
    }
    else {
      try {
        let user
        try {
          if (name) {
            let search = (await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform))
            if (search) {
              user = (await interaction.client.MultiversusClient.getAccount(search.account_id))
            }
          }
          else {
            let wbId = await interaction.client.utils.getLinkedAccount(interaction.user)
            if (!wbId) return interaction.editReply("You must have a linked account to use commands without search queries.")
            user = (await interaction.client.MultiversusClient.getAccount(wbId))
            name = interaction.user.username
          }
        }
        catch (e) {
          if (e.code == 401) {
            return interaction.editReply("Key refreshed. Please try again.")
          }
        }

        if (!user) {
          interaction.editReply("User not found.")
          return
        }
        let data = await interaction.client.MultiversusClient.getProfileLeaderboardForCharacter(user.id, type, character)
        let mmr = data.score
        let rank = data.rank

        let embed = new EmbedBuilder()
          .setTitle(`${name}'s ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName} Rank (${type})`)
          .setColor("#00ff00")
          .addFields(
            { name: "Rank", value: `${rank}` },
            { name: "MMR", value: `${Math.round(mmr)}` },
          )
          .setThumbnail(`https://oliy.is-just-a.dev/mvs_characters/${character}.png`)
          .setFooter({ text: "Created by Steven4547466#1407", iconURL: interaction.client.user.displayAvatarURL() });

        interaction.editReply({ embeds: [embed] })
      }
      catch (e) {
        if (e.code == 401) {
          return interaction.editReply("Key refreshed. Please try again.")
        }
      }
    }
  }
}