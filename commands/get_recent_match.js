const { SlashCommandBuilder, EmbedBuilder, CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { CharacterData } = require("multiversus.js")

async function getMatchHistory(interaction, id, type, pageToGet) {
  let data
  try {
    data = (await interaction.client.MultiversusClient.getMatches(id, pageToGet))
  }
  catch (e) {
    if (e.code == 401) {
      return { code: 401 }
    }
    else if (e.code == 503) {
      return { code: 503 }
    }
    else {
      return { matches: [], totalPages: 0 }
    }
  }

  let matches = data.matches.filter(match => (type ? match.template.name == type : ["1v1", "2v2", "ffa"].includes(match.template.slug)) && match.players.all.length >= 2 && match.completion_time != null)
  return { matches, totalPages: data.total_pages }
}

async function handleMatchHistory(interaction, id, name, type, mobile) {

  const maxMatches = 1

  let matches = []

  let currentPage = 1

  let startAt = 0

  let totalPages = currentPage

  while (currentPage <= totalPages) {
    let data = await getMatchHistory(interaction, id, type, currentPage)
    if (data.code == 401) {
      interaction.editReply("Key refreshed. Please try again.")
      return
    }

    totalPages = data.totalPages
    for (let i = startAt; i < data.matches.length; i++) {
      matches.push(data.matches[i])
      startAt = i + 1
      if (matches.length == maxMatches) {
        break
      }
    }

    if (currentPage == totalPages && startAt >= data.matches.length) {
      break
    }

    if (matches.length == maxMatches)
      break
    currentPage++
  }

  if (!mobile) {
    let description = `\`\`\`ansi\n[1;37mRecent match for ${name}${type ? ` (${type})` : ""}[0m\n`;

    for (let match of matches) {
      let matchData

      try {
        matchData = await interaction.client.MultiversusClient.getMatch(match.id)
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

      let accountIdsToUserData = {}

      for (let serverPlayerData of matchData.server_data.PlayerData) {
        interaction.client.utils.addTrackedUser(serverPlayerData.AccountId)
        let playerData = matchData.data.ratingUpdates && !serverPlayerData.AccountId.startsWith("bot") ? matchData.data.ratingUpdates.player_rating_changes.find(c => c.player_account_id == serverPlayerData.AccountId) : null
        // let serverPlayerData = matchData.server_data.PlayerData.find(c => c.AccountId == player.account_id)
        let isCustom = matchData.server_data.IsCustomMatch
        let type = matchData.template.slug
        let isBot = serverPlayerData.AccountId.startsWith("bot")
        let playerLeaderboard
        if (!isBot && serverPlayerData.CharacterSlug.length > 0) {
          try {
            playerLeaderboard = (await interaction.client.MultiversusClient.getProfileLeaderboardForCharacter(serverPlayerData.AccountId, type, serverPlayerData.CharacterSlug))
          }
          catch (e) { }
        }

        let currentRating = playerLeaderboard ? playerLeaderboard.score : null

        accountIdsToUserData[serverPlayerData.AccountId] = {
          username: serverPlayerData.Username, //player.identity.alternate.wb_network[0].username,
          preMatchRating: playerData ? playerData.pre_match_rating : 0,
          postMatchRating: playerData ? playerData.post_match_rating : 0,
          character: serverPlayerData.CharacterSlug.length > 0 ? Object.entries(CharacterData).find((entry) => entry[1].id == serverPlayerData.CharacterSlug)[1].displayName : "?",
          ratingChange: !isBot && playerData ? playerData.post_match_rating.mean - playerData.pre_match_rating.mean : isCustom ? "Custom Game" : isBot ? "BOT" : "?",
          team: serverPlayerData.TeamIndex + 1,
          currentRating: currentRating,
          isCustom: isCustom,
          isBot: isBot
        }
      }

      let teams = {}

      for (let [id, data] of Object.entries(accountIdsToUserData)) {
        if (!teams[data.team]) teams[data.team] = []
        teams[data.team].push(data)
      }
      description += (`
[1;37mMatch at ${new Date(matchData.created_at).toString()}[0m.

[1;32mWinner[0;37m: Team ${matchData.server_data.WinningTeamId + 1}[0m.

${Object.entries(teams).map(([teamIndex, players]) => `[0;33mTeam ${teamIndex}:\n${players.map(p => `[0;37m${p.username} | [1;36m${p.character} [0;37m(${p.isCustom ? `[0;30m${p.ratingChange}` : p.isBot ? "[0;30mBOT" : isNaN(p.ratingChange) ? "[0;30m?" : Math.round(p.ratingChange) == 0 ? `[0;30m${Math.round(p.ratingChange)}` : Math.round(p.ratingChange) < 0 ? `[0;31m${Math.round(p.ratingChange)}` : `[0;32m${Math.round(p.ratingChange)}`}${!p.isCustom && p.currentRating ? `[0;37m | [0;33m${Math.round(p.currentRating)}` : ""}[0;37m)`).join("\n")}`).join("\n")}

${matchData.server_data.TeamScores ? matchData.server_data.TeamScores.map((score, index) => `[0;33mTeam ${index + 1}[1;37m Score: [1;34m${score}[0m`).join("\n") : "Team score not available"}
[4;37m____________________[0m\n
`)
    }

    interaction.editReply({ content: description + "```" })
  } else {
    let embed = new EmbedBuilder()
      .setTitle(`Recent match for ${name}${type ? ` (${type})` : ""}`)
      .setColor("#00ffff")
      .setThumbnail("https://cdn.discordapp.com/attachments/501853552835297285/1003349507947384912/Multiversus_long_logo_1.png")
      .setFooter({ text: `Created by Steven4547466#1407`, iconURL: interaction.client.user.displayAvatarURL() });
    for (let match of matches) {
      let matchData

      try {
        matchData = await interaction.client.MultiversusClient.getMatch(match.id)
      }
      catch (e) {
        if (e.code == 401) {
          return interaction.editReply("Key refreshed. Please try again.")
        }
      }

      let accountIdsToUserData = {}

      for (let serverPlayerData of matchData.server_data.PlayerData) {
        let playerData = matchData.data.ratingUpdates && !serverPlayerData.AccountId.startsWith("bot") ? matchData.data.ratingUpdates.player_rating_changes.find(c => c.player_account_id == serverPlayerData.AccountId) : null
        // let serverPlayerData = matchData.server_data.PlayerData.find(c => c.AccountId == player.account_id)
        let isCustom = matchData.server_data.IsCustomMatch
        let type = matchData.template.slug
        let isBot = serverPlayerData.AccountId.startsWith("bot")
        let playerLeaderboard
        if (!isBot && serverPlayerData.CharacterSlug.length > 0) {
          try {
            playerLeaderboard = (await interaction.client.MultiversusClient.getProfileLeaderboardForCharacter(serverPlayerData.AccountId, type, serverPlayerData.CharacterSlug))
          }
          catch (e) { }
        }

        let currentRating = playerLeaderboard ? playerLeaderboard.score : null

        accountIdsToUserData[serverPlayerData.AccountId] = {
          username: serverPlayerData.Username, //player.identity.alternate.wb_network[0].username,
          preMatchRating: playerData ? playerData.pre_match_rating : 0,
          postMatchRating: playerData ? playerData.post_match_rating : 0,
          character: serverPlayerData.CharacterSlug.length > 0 ? Object.entries(CharacterData).find((entry) => entry[1].id == serverPlayerData.CharacterSlug)[1].displayName : "?",
          ratingChange: !isBot && playerData ? playerData.post_match_rating.mean - playerData.pre_match_rating.mean : isCustom ? "Custom Game" : isBot ? "BOT" : "?",
          team: serverPlayerData.TeamIndex + 1,
          currentRating: currentRating,
          isCustom: isCustom,
          isBot: isBot
        }
      }

      let teams = {}

      for (let [id, data] of Object.entries(accountIdsToUserData)) {
        if (!teams[data.team]) teams[data.team] = []
        teams[data.team].push(data)
      }

      embed.addFields(
        {
          name: `Match at <t:${Math.round(new Date(matchData.created_at).getTime() / 1000)}:f>`,
          value:
            `
Winner: Team ${matchData.server_data.WinningTeamId + 1}

${Object.entries(teams).map(([teamIndex, players]) => `Team ${teamIndex}:\n${players.map(p => `${p.username} | ${p.character} (${p.isCustom ? p.ratingChange : p.isBot ? "BOT" : isNaN(p.ratingChange) ? "?" : Math.round(p.ratingChange) == 0 ? `${Math.round(p.ratingChange)}` : Math.round(p.ratingChange) < 0 ? `${Math.round(p.ratingChange)}` : `${Math.round(p.ratingChange)}`}${!p.isCustom && p.currentRating ? ` | ${Math.round(p.currentRating)}` : ""})`).join("\n")}`).join("\n")}

${matchData.server_data.TeamScores ? matchData.server_data.TeamScores.map((score, index) => `Team ${index + 1} Score: ${score}`).join("\n") : "Team score not available"}
`
        }
      )

    }

    interaction.editReply({ embeds: [embed] })
  }

}

module.exports = {
  updateMethod: handleMatchHistory,
  name: "getrecentmatch",
  data: new SlashCommandBuilder()
    .setName("getrecentmatch")
    .setDescription("Get the most recent match of a user.")
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the player")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of match to get")
          .setRequired(false)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
            { name: 'ffa', value: 'ffa' }
          )
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
    let name = interaction.options.getString("user")
    let type = interaction.options.getString("type")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"
    let mobile = interaction.options.getBoolean("mobile")

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

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
        user = { id: wbId }
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
    }

    if (!user) {
      interaction.editReply("User not found.")
      return
    }

    // console.log(user.id)

    handleMatchHistory(interaction, user.id, name, type, mobile)
  }
}