const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CharacterData, PerkData } = require("multiversus.js")

module.exports = {
  name: "getcurrentmatch",
  data: new SlashCommandBuilder()
    .setName("getcurrentmatch")
    .setDescription("Get the rank of a user.")
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the player")
          .setRequired(false)
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
    // if (interaction.user.id != "353782817777385472")
    //   return interaction.editReply("Coming soon.")
    let name = interaction.options.getString("user")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    let user
    if (name) {
      let search = (await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform))
      if (search) {
        user = (await interaction.client.MultiversusClient.getAccount(search.account_id))
      }
    }
    else {
      let wbId = await interaction.client.utils.getLinkedAccount(interaction.user)
      if (!wbId) return interaction.editReply("You must have a linked account to use commands without search queries.")
      user = { id: wbId }
      name = interaction.user.username
    }
    if (!user) {
      interaction.editReply("User not found.")
      return
    }

    let matches = (await interaction.client.MultiversusClient.getMatches(user.id))

    if (!matches || !matches.matches || matches.matches.length == 0) {
      interaction.editReply("User has no matches.")
      return
    }

    matches = matches.matches

    let currentMatch = matches.find(m => m.completion_time == null)

    if (!currentMatch) {
      interaction.editReply("User has no current match.")
      return
    }

    // let profile = await interaction.client.MultiversusClient.getProfile(user.account_id)

    let match = await interaction.client.MultiversusClient.getMatch(currentMatch.id)

    // require("fs").writeFileSync("./curmatch.json", JSON.stringify(match, null, 2))

    let inWaitingRoom = match.template.slug == "waitingroom"
    let isCustomLobby = match.template.slug == "custom_game_lobby"
    if (inWaitingRoom || isCustomLobby) {
      interaction.editReply("User has no current match.")
      return
    }

    let inProgress = ["1v1", "2v2", "ffa"].includes(match.template.slug)
    let inCharacterOrPerkSelect = match.template.slug.includes("container")
    let isCustom = isCustomLobby || match.server_data.IsCustomMatch
    let matchType = match.template.slug.split("_")[0]
    // let serverCluster = match.cluster

    let players = []

    // for (let [id, player] of Object.entries(match.server_data.RegisteredPlayers)) {
    //   players.push({
    //     name: id.startsWith("Bot") ? player.Username + " (BOT)" : match.players.all.find(p => p.account_id == id).identity.alternate.wb_network[0].username,
    //     team: player.TeamIndex,
    //     // score: 
    //   })
    // }

    try {
      if (inProgress || inCharacterOrPerkSelect) {
        for (let player of match.players.all) {
          let account = await interaction.client.MultiversusClient.getAccount(player.account_id)
          let profile = await interaction.client.MultiversusClient.getProfile(player.account_id)
          let character = inProgress ? account.data.LastPlayedCharacterSlug : match.server_data.RegisteredPlayers[player.account_id].Fighter.Slug
          let characterData = profile.data.PerkPreferences.Characters[character]
          let d = profile.server_data[`${matchType}shuffle`]
          // console.log(`${matchType}shuffle`)
          let highestKey = `${Object.keys(d).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`
          let score = d[highestKey].ratings[character] ? Math.round(d[highestKey].ratings[character].mean) : "?"
          players.push({
            name: player.identity.alternate.wb_network[0].username,
            character: character.trim() == "" ? "Not selected" : Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName,
            perks: character.trim() == "" ? ["Not selected"] : characterData.PerkPages[characterData.LastSelectedPage].PerkSlugs.map((p, i) => {
              if (p.trim() == "") return `${i == 0 ? "Signature: " : `Slot #${i}: `}Empty`
              let perk = Object.entries(PerkData).find((entry) => entry[1].slugs.includes(p))[1]
              return `${i == 0 ? "Signature: " : `Slot #${i}: `}${perk.displayName}`
            }),
            score,
          })
        }
      }
    } catch (e) {
      console.error(e)
      return interaction.editReply("Error getting match data.")
    }

    let embed = new EmbedBuilder()
      .setTitle(`${name}'s current match`)
      .setDescription(`${inProgress ? "In progress" : inCharacterOrPerkSelect ? "In selection phase" : "Unknown"}${isCustom ? " (Custom)" : ""}${matchType ? ` (${matchType})` : ""}`)
    // .addFields({ name: "Server", value: serverCluster.slice(serverCluster.indexOf("-") + 1, serverCluster.lastIndexOf("-")) })

    for (let i = 0; i < players.length; i++) {
      let player = players[i]
      embed.addFields({ name: `Fighter: ${player.name}`, value: `**Character:** ${player.character}\n**Perks:**\n${player.perks.join("\n")}\n**MMR:** ${player.score}` })
    }

    interaction.editReply({ embeds: [embed] })
    // interaction.editReply("Not implemented yet.")
  }
}