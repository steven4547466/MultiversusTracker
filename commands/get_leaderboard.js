const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { CharacterData } = require("multiversus.js")

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

module.exports = {
  name: "getleaderboard",
  data: new SlashCommandBuilder()
    .setName("getleaderboard")
    .setDescription("Get the leaderboard.")
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of leaderboard to get")
          .setRequired(true)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
          )
    )
    .addStringOption(
      opt =>
        opt.setName("character")
          .setDescription("The character to check (if not added, gets overall leaderboard)")
          .setRequired(false)
          .addChoices(...(buildCharacterChoices()))
    )
    .addBooleanOption(
      opt =>
        opt.setName("mobile")
          .setDescription("Display a mobile version of the leaderboard")
          .setRequired(false)
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let type = interaction.options.getString("type")
    let character = interaction.options.getString("character")
    let mobile = interaction.options.getBoolean("mobile")

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    let leaderboard
    try {
      if (!character) leaderboard = (await interaction.client.MultiversusClient.getLeaderboard(type)).leaders
      else leaderboard = (await interaction.client.MultiversusClient.getLeaderboardForCharacter(type, character)).leaders
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

    if (!leaderboard) {
      return interaction.editReply("No leaderboard found.")
    }

    // Buffer.from(chart.toBase64Image().split(",")[1], "base64")

    leaderboard.length = 15

    if (!mobile) {
      let msg = `\`\`\`ansi\n[1;37m${type} Leaderboard${character ? ` for ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName}` : ""}[0m\n`

      for (let leader of leaderboard) {
        let profile, shuffleData, highestKey
        if (!character) {
          profile = await interaction.client.MultiversusClient.getProfile(leader.account.id)
          shuffleData = profile.server_data[`${type}shuffle`]
          highestKey = `${Object.keys(shuffleData).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`
        }

        msg += `[0;34m#${leader.rank} [1;37m${leader.account.identity.alternate.wb_network[0].username} [0;37m([1;32m${Math.round(leader.score)}${character ? "" : `[1;37m |[0;37m ${Object.entries(CharacterData).find((entry) => entry[1].id == shuffleData[highestKey].topRating.character)[1].displayName}`}[0;37m)\n`
      }

      interaction.editReply({ content: msg + "```" })
    }
    else {
      let embed = new EmbedBuilder()
        .setTitle(`${type} Leaderboard${character ? ` for ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName}` : ""}`)
        .setColor("#00FFFF")
        .setFooter({ text: "Created by Steven4547466#1407", iconURL: interaction.client.user.displayAvatarURL() });

      for (let leader of leaderboard) {
        let profile, shuffleData, highestKey
        if (!character) {
          profile = await interaction.client.MultiversusClient.getProfile(leader.account.id)
          shuffleData = profile.server_data[`${type}shuffle`]
          highestKey = `${Object.keys(shuffleData).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`
        }

        embed.addFields({
          name: `#${leader.rank} ${leader.account.identity.alternate.wb_network[0].username} (${Math.round(leader.score)})`,
          value: character ? "​" : Object.entries(CharacterData).find((entry) => entry[1].id == shuffleData[highestKey].topRating.character)[1].displayName
        })
      }

      if (character) {
        embed.setThumbnail(`https://oliy.is-just-a.dev/mvs_characters/${character}.png`)
      }

      interaction.editReply({ embeds: [embed] })
    }
  }
}