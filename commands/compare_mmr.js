const { SlashCommandBuilder, EmbedBuilder, CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, embedLength, AttachmentBuilder } = require("discord.js");
const { CharacterData } = require("multiversus.js")
const { ChartJSNodeCanvas } = require("chartjs-node-canvas")
const ChartDataLabels = require("chartjs-plugin-datalabels")
const moment = require("moment")

const colors = ['darkslategray', 'darkolivegreen', 'sienna', 'seagreen', 'midnightblue', 'darkgreen', 'slategray', 'darkred', 'olive', 'darkgoldenrod', 'steelblue', 'navy', 'chocolate', 'yellowgreen', 'lightseagreen', 'indianred', 'limegreen', 'purple2', 'darkseagreen', 'maroon3', 'darkorchid', 'red', 'orange', 'gold', 'mediumblue', 'lime', 'mediumspringgreen', 'crimson', 'aqua', 'deepskyblue', 'blue', 'purple3', 'greenyellow', 'tomato', 'orchid', 'lightsteelblue', 'fuchsia', 'khaki', 'laserlemon', 'cornflower', 'plum', 'lightgreen', 'deeppink', 'mediumslateblue', 'lightsalmon', 'wheat', 'paleturquoise', 'aquamarine', 'hotpink', 'pink']

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

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
    return { matches: [], totalPages: 0 }
  }

  let matches = data.matches.filter(match => (type ? match.template.name == type : ["1v1", "2v2", "ffa"].includes(match.template.slug)) && match.players.all.length >= 2 && match.completion_time != null)
  return { matches, totalPages: data.total_pages }
}

module.exports = {
  name: "comparemmr",
  data: new SlashCommandBuilder()
    .setName("comparemmr")
    .setDescription("Compare the mmr of multiple users.")
    .addStringOption(
      opt =>
        opt.setName("users")
          .setDescription("The usernames of the players. Separate multiple usernames with a comma.")
          .setRequired(true)
    )
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of mmr to get")
          .setRequired(true)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
            // { name: 'ffa', value: 'ffa' }
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
    .addStringOption(
      opt =>
        opt.setName("character")
          .setDescription("The character to check (if not added, gets top rated)")
          .setRequired(false)
          .addChoices(...(buildCharacterChoices()))
    )
    .addStringOption(
      opt =>
        opt.setName("start-date")
          .setDescription("The date to begin the search at. Format: YYYY-MM-DD")
    )
    .addStringOption(
      opt =>
        opt.setName("end-date")
          .setDescription("The date to end the search at. Format: YYYY-MM-DD. If ommitted, defaults to today")
    )
    .addIntegerOption(
      opt =>
        opt.setName("increment")
          .setDescription("The increment of the x-axis grouping. Defaults to 1 day.")
          .addChoices(
            { name: "12 hours", value: 1 },
            { name: "1 day", value: 2 },
            { name: "1 week", value: 3 },
            { name: "1 month", value: 4 },
            { name: "6 months", value: 5 }
          )
    )
    .addBooleanOption(
      opt =>
        opt.setName("include-now")
          .setDescription("Whether to include current mmr. Ignored if no start-date is provided.")
    )
    .addBooleanOption(
      opt =>
        opt.setName("show-values")
          .setDescription("Whether to show all data values. Disable if graph is too large. Ignored if no start-date is provided")
    )
    .addBooleanOption(
      opt =>
        opt.setName("export-csv")
          .setDescription("Whether to include export the into a csv file as well. Ignored if no start-date is provided.")
    )
    .addBooleanOption(
      opt =>
        opt.setName("multiply-confidence")
          .setDescription("Whether to multiply their mmr confidence. Higher mmr confidence means more accurate mmr.")
    )
    .addBooleanOption(
      opt =>
        opt.setName("show-deviation")
          .setDescription("Whether to show standard deviation. Lower is better. Ignored if start-date is provided.")
    )
    .addStringOption(
      opt =>
        opt.setName("sort")
          .setDescription("How to sort mmr. Defaults to user order. Ignored if start-date is provided.")
          .addChoices(
            { name: "User order", value: "user" },
            { name: "Ascending", value: "asc" },
            { name: "Descending", value: "desc" }
          )
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let names = interaction.options.getString("users")
    let type = interaction.options.getString("type")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"
    let startDateTemp = interaction.options.getString("start-date")
    let endDateTemp = interaction.options.getString("end-date")
    let startDate
    let endDate
    let includeNow = interaction.options.getBoolean("include-now") == null ? true : interaction.options.getBoolean("include-now")
    let exportCsv = interaction.options.getBoolean("export-csv") == null ? false : interaction.options.getBoolean("export-csv")
    let showValues = interaction.options.getBoolean("show-values") == null ? true : interaction.options.getBoolean("show-values")
    let multiplyConfidence = interaction.options.getBoolean("multiply-confidence") == null ? false : interaction.options.getBoolean("multiply-confidence")
    let showDeviance = interaction.options.getBoolean("show-deviation") == null ? false : interaction.options.getBoolean("show-deviation")
    let sort = interaction.options.getString("sort") == null ? "user" : interaction.options.getString("sort")

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    if (startDateTemp) {
      if (!(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/).test(startDateTemp)) {
        interaction.editReply("Invalid start date format. Format: YYYY-MM-DD")
        return
      }
      startDate = new Date(startDateTemp)
    }

    if (endDateTemp) {
      if (!(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/).test(endDateTemp)) {
        interaction.editReply("Invalid end date format. Format: YYYY-MM-DD")
        return
      }
      endDate = new Date(endDateTemp)
    }

    let users = []
    try {
      for (let name of names.split(",")) {
        let user
        try {
          user = await interaction.client.MultiversusClient.searchExactUsername(name.trim(), 100, null, platform)
        } catch (e) {
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
          interaction.editReply("Could not find user " + name.trim())
          return
        }
        users.push(user)
      }
    }
    catch (e) {
      if (e.code == 401) {
        return interaction.editReply("Key refreshed. Please try again.")
      }
      else if (e.code == 503) {
        return interaction.editReply("Maintenance mode is activated. Please try again later.")
      }
    }

    if (!users) {
      interaction.editReply("One or more users not found.")
      return
    }

    if (!startDate && !endDate) {
      let character = interaction.options.getString("character")
      // let profile = await interaction.client.MultiversusClient.getProfile(user.account_id)
      if (!character) {
        let data = []
        for (let user of users) {
          let profile
          try {
            profile = await interaction.client.MultiversusClient.getProfile(user.account_id, type)
          } catch (e) {
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
          let d = profile.server_data[`${type}shuffle`]
          if (!d) {
            interaction.editReply("No data found for " + user.username)
            return
          }

          let highestKey = `${Object.keys(d).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`

          d = d[highestKey]

          data.push({
            mmr: d.topRating.mean,
            name: user.account.identity.alternate.wb_network[0].username,
            confidence: d.topRating.confidence,
            deviation: d.topRating.deviance,
          })
        }

        if (sort == "asc") {
          data.sort((a, b) => a.mmr * (multiplyConfidence ? a.confidence : 1) - b.mmr * (multiplyConfidence ? b.confidence : 1))
        }
        else if (sort == "desc") {
          data.sort((a, b) => b.mmr * (multiplyConfidence ? b.confidence : 1) - a.mmr * (multiplyConfidence ? a.confidence : 1))
        }

        return interaction.editReply(`Comparing MMR${multiplyConfidence ? " * confidence" : ""} for ${type}\n` + data.map(d => `${d.name} - ${Math.round(d.mmr * (multiplyConfidence ? d.confidence : 1))}${showDeviance ? ` ± ${d.deviation}` : ""}`).join("\n"))
      }
      else {
        let data = []
        for (let user of users) {
          let profile
          try {
            profile = await interaction.client.MultiversusClient.getProfile(user.account_id, type)
          } catch (e) {
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

          let d = profile.server_data[`${type}shuffle`]
          if (!d) {
            interaction.editReply("No data found for " + user.username)
            return
          }

          let highestKey = `${Object.keys(d).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`

          d = d[highestKey]

          data.push({
            mmr: d.ratings[character].mean,
            name: user.account.identity.alternate.wb_network[0].username,
            confidence: d.ratings[character].confidence,
            deviation: d.ratings[character].deviance,
          })
        }

        if (sort == "asc") {
          data.sort((a, b) => a.mmr * (multiplyConfidence ? a.confidence : 1) - b.mmr * (multiplyConfidence ? b.confidence : 1))
        }
        else if (sort == "desc") {
          data.sort((a, b) => b.mmr * (multiplyConfidence ? b.confidence : 1) - a.mmr * (multiplyConfidence ? a.confidence : 1))
        }

        return interaction.editReply(`Comparing MMR${multiplyConfidence ? " * confidence" : ""} for ${type} (${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName})\n` + data.map(d => `${d.name} - ${Math.round(d.mmr * (multiplyConfidence ? d.confidence : 1))}${showDeviance ? ` ± ${d.deviation}` : ""}`).join("\n"))
      }

    }
    else {
      let channel = await interaction.client.channels.fetch(interaction.channelId)
      if (users.length > 10 && interaction.user.id != "353782817777385472") {
        interaction.editReply("Graphing multiple players' history is not permitted above 10 players.")
        return
      }

      let colorsToUse = []

      for (let i = 0; i < users.length; i++) {
        let color = colors[Math.floor(Math.random() * colors.length)]
        while (colorsToUse.includes(color)) {
          color = colors[Math.floor(Math.random() * colors.length)]
        }
        colorsToUse.push(color)
      }

      // await interaction.editReply("Graphing comparison not yet impelemented.")
      if (!startDate) {
        startDate = new Date()
      } else if (!endDate) {
        endDate = new Date()
      }

      if (startDate > new Date()) {
        interaction.editReply("Start date cannot be in the future.")
        return
      }

      if (endDate > new Date()) {
        endDate = new Date()
      }

      endDate.setDate(endDate.getDate() + 1);

      let character = interaction.options.getString("character")

      let totalData = []

      let messageId = null

      for (let user of users) {
        let pageOneMatches = await getMatchHistory(interaction, user.account_id, type, 1)
        if (pageOneMatches.code == 401) {
          if (messageId) {
            (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Key refreshed. Please try again.`)
          }
          else {
            try {
              await interaction.editReply("Key refreshed. Please try again.")
            } catch (e) {
              await channel.send(`${interaction.user.toString()} Key refreshed. Please try again.`)
            }
          }
          return
        }

        let totalPages = pageOneMatches.totalPages

        let curPage = Math.floor(totalPages / 2)

        let matches = []

        while (true) {
          // console.log(curPage)
          if (curPage <= 0 || curPage > totalPages) {
            if (messageId) {
              (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} No matches found within range.`)
            }
            else {
              try {
                await interaction.editReply("No matches found within range.")
              } catch (e) {
                await channel.send(`${interaction.user.toString()} No matches found within range.`)
              }
            }
            return
          }

          let midPageMatches = await getMatchHistory(interaction, user.account_id, type, curPage)

          if (midPageMatches.code == 401) {
            if (messageId) {
              (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Key refreshed. Please try again.`)
            }
            else {
              try {
                await interaction.editReply("Key refreshed. Please try again.")
              } catch (e) {
                await channel.send(`${interaction.user.toString()} Key refreshed. Please try again.`)
              }
            }
            return
          }

          let matchWithinDateIndex = midPageMatches.matches.findIndex(m => new Date(m.completion_time) >= startDate && new Date(m.completion_time) <= endDate)

          if (matchWithinDateIndex != -1) {
            matches = midPageMatches.matches.filter(m => new Date(m.completion_time) >= startDate && new Date(m.completion_time) <= endDate)
            break;
          }
          else {
            if (midPageMatches.matches.length == 0) {
              break;
            }
            let mostRecentOnPage = midPageMatches.matches[0]
            let mostRecentTime = new Date(mostRecentOnPage.completion_time)
            if (mostRecentTime > endDate) {
              if (curPage >= totalPages) {
                if (messageId) {
                  (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} No matches found within range.`)
                }
                else {
                  try {
                    await interaction.editReply("No matches found within range.")
                  } catch (e) {
                    await channel.send(`${interaction.user.toString()} No matches found within range.`)
                  }
                }
                return
              }
              curPage = Math.ceil((curPage + totalPages) / 2)
            }

            let leastRecentOnPage = midPageMatches.matches[midPageMatches.matches.length - 1]
            let leastRecentTime = new Date(leastRecentOnPage.completion_time)
            if (leastRecentTime < startDate) {
              curPage = Math.floor(curPage / 2)
            }
          }
        }

        let continueUp = true
        let continueDown = true

        let i = 1;
        while (true) {
          if (!continueUp && !continueDown) break
          if (curPage + i > totalPages) {
            continueUp = false
          }

          if (continueUp && curPage + i <= totalPages) {
            let mat = await getMatchHistory(interaction, user.account_id, type, curPage + i)
            if (mat.code == 401) {
              if (messageId) {
                (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Key refreshed. Please try again.`)
              }
              else {
                try {
                  await interaction.editReply("Key refreshed. Please try again.")
                } catch (e) {
                  await channel.send(`${interaction.user.toString()} Key refreshed. Please try again.`)
                }
              }
              return
            }

            if (mat.matches.length > 0) {
              let matchesWithinDate = mat.matches.filter(m => new Date(m.completion_time) >= startDate && new Date(m.completion_time) <= endDate)
              if (matchesWithinDate.length == 0) {
                continueUp = false
              }
              else {
                matches = matches.concat(matchesWithinDate)
              }
            }
          }

          if (curPage - i <= 0) {
            continueDown = false
          }

          if (continueDown && curPage - i > 0) {
            let mat = await getMatchHistory(interaction, user.account_id, type, curPage - i)
            if (mat.code == 401) {
              if (messageId) {
                (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Key refreshed. Please try again.`)
              }
              else {
                try {
                  await interaction.editReply("Key refreshed. Please try again.")
                } catch (e) {
                  await channel.send(`${interaction.user.toString()} Key refreshed. Please try again.`)
                }
              }
              return
            }

            if (mat.matches.length > 0) {
              let matchesWithinDate = mat.matches.filter(m => new Date(m.completion_time) >= startDate && new Date(m.completion_time) <= endDate)
              if (matchesWithinDate.length == 0) {
                continueDown = false
              } else {
                matches = matches.concat(matchesWithinDate)
              }
            }
          }
          i++
        }

        if (matches.length == 0) {
          if (messageId) {
            (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} No matches found.`)
          }
          else {
            try {
              await interaction.editReply("No matches found.")
            } catch (e) {
              await channel.send(`${interaction.user.toString()} No matches found.`)
            }
          }
          return
        }

        if (messageId) {
          (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while.`)
        }
        else {
          try {
            await interaction.editReply(`Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while.`)
          } catch (e) {
            messageId = (await channel.send(`${interaction.user.toString()} Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while.`)).id
          }
        }

        let nextMilestone = 20

        let times = []

        for (let i = 0; i < matches.length; i++) {
          let before = Date.now()
          try {
            matches[i] = await interaction.client.MultiversusClient.getMatch(matches[i].id)
          } catch (e) {
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

          times.push(Date.now() - before)
          if (i / matches.length * 100 > nextMilestone) {
            if (messageId) {
              (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while. (${nextMilestone}% complete. ETA: ${Math.round(times.reduce((a, b) => a + b, 0) / times.length * (matches.length - i - 1) / 60000)} minute(s))`)
            }
            else {
              try {
                await interaction.editReply(`Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while. (${nextMilestone}% complete. ETA: ${Math.round(times.reduce((a, b) => a + b, 0) / times.length * (matches.length - i - 1) / 60000)} minute(s))`)
              } catch (e) {
                messageId = (await channel.send(`${interaction.user.toString()} Fetching ${user.account.identity.alternate.wb_network[0].username}'s match data for ${matches.length} matches. This could take a while. (${nextMilestone}% complete. ETA: ${Math.round(times.reduce((a, b) => a + b, 0) / times.length * (matches.length - i - 1) / 60000)} minute(s))`)).id
              }
            }
            nextMilestone += 20
          }
        }

        let highChar = character

        if (!highChar) {
          let profile
          try {
            profile = await interaction.client.MultiversusClient.getProfile(user.account_id)
          } catch (e) {
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

          let shuffleData = profile.server_data[`${type}shuffle`]

          if (!shuffleData) {
            interaction.editReply("")
            if (messageId) {
              (await channel.messages.fetch(messageId)).edit(`${interaction.user.toString()} Data not found. Try again later`)
            }
            else {
              try {
                await interaction.editReply("No matches found.")
              } catch (e) {
                await channel.send(`${interaction.user.toString()} Data not found. Try again later`)
              }
            }
            return
          }

          let highestKey = `${Object.keys(shuffleData).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`
          highChar = shuffleData[highestKey].topRating.character
        }

        matches = matches.filter(m => !m.server_data.IsCustomMatch && m.data.ratingUpdates && m.data.ratingUpdates.playerRatingChanges && m.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.account_id) && m.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.account_id).postMatchRating.character == highChar)

        matches.sort((a, b) => new Date(a.completion_time) - new Date(b.completion_time))

        let data
        try {
          data = data = await interaction.client.MultiversusClient.getProfileLeaderboardForCharacter(user.account_id, type, highChar)
        } catch (e) {
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

        let curMmr = data.score

        let d = {}

        let increment = interaction.options.getInteger("increment") || 2

        for (let match of matches) {
          let time = new Date(match.completion_time)
          let key
          if (increment == 1) {
            key = `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()} ${time.getHours() <= 11 ? 0 : 12}:00 - ${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()} ${time.getHours() <= 11 ? 12 : 23}:00`
          }
          else if (increment == 2) {
            key = `${time.getFullYear()}-${time.getMonth() + 1}-${time.getDate()}`
          }
          else if (increment == 3) {
            let mom = `${moment(time).year()} Week ${moment(time).week()}`
            key = `${mom}`
          }
          else if (increment == 4) {
            key = `${time.getFullYear()}-${time.getMonth() + 1}-00 - ${time.getFullYear()}-${time.getMonth() + 1}-${new Date(time.getFullYear(), time.getMonth() + 1, 0).getDate()}`
          }
          else if (increment == 5) {
            key = `${time.getFullYear()}-${time.getMonth() + 1 <= 6 ? 0 : 7} - ${time.getFullYear()}-${time.getMonth() + 1 <= 6 ? 6 : 12}`
          }
          if (!d[key]) {
            d[key] = []
          }
          d[key].push(match.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.account_id).postMatchRating.mean)
        }

        let dataToSend = []

        for (let [key, value] of Object.entries(d)) {
          dataToSend.push({ date: key, average: Math.round(value.reduce((a, b) => a + b, 0) / value.length) })
        }

        if (includeNow) dataToSend.push({ date: "Now", average: curMmr })

        totalData.push({ highChar, name: user.account.identity.alternate.wb_network[0].username, data: dataToSend })
      }

      let allDates = []

      for (let data of totalData) {
        if (allDates.length == 0) {
          for (let d of data.data) {
            allDates.push(d.date)
          }
        }
        else {
          for (let d of data.data) {
            if (!allDates.includes(d.date)) {
              allDates.push(d.date)
            }
          }
        }
      }

      allDates.sort((a, b) => {
        if (a == "Now") return 1
        else if (b == "Now") return -1
        if (a.includes("Week")) {
          let date1 = new Date(a.split(" ")[0])
          let date2 = new Date(b.split(" ")[0])
          date1.setMilliseconds(date1.getMilliseconds() + parseInt(a.split("Week ")[1]) * 604800000)
          date2.setMilliseconds(date2.getMilliseconds() + parseInt(a.split("Week ")[1]) * 604800000)

          return date1 - date2
        }
        else {
          return new Date(a) - new Date(b)
        }
      })

      for (let i = 0; i < allDates.length; i++) {
        for (let data of totalData) {
          if (!data.data[i].date != "Now" && data.data[i].date != allDates[i]) {
            data.data.splice(i, 0, { date: allDates[i], average: data.data[i >= data.data.length ? data.data.length - 1 : i].average })
          }
        }
      }

      let config = {
        type: 'line',
        data: {
          labels: allDates,
          // datasets: [{
          //   label: `${type} MMR history for ${name} (${Object.entries(CharacterData).find((entry) => entry[1].id == highChar)[1].displayName})`,
          //   data: dataToSend.map(m => m.average),
          //   fill: false,
          //   borderColor: `#${Math.floor(Math.random()*16777215).toString(16)}`,
          //   tension: 0
          // }]
          datasets: totalData.map((d, i) => {
            return {
              label: `${d.name} (${Object.entries(CharacterData).find((entry) => entry[1].id == d.highChar)[1].displayName})`,
              data: d.data.map(m => m.average),
              fill: false,
              borderColor: colorsToUse[i],
              tension: 0
            }
          })
        },
        plugins: [
          {
            id: 'custom_canvas_background_color',
            beforeDraw: function (chart) {
              const { ctx } = chart
              ctx.save()
              ctx.globalCompositeOperation = 'destination-over'
              ctx.fillStyle = 'white'
              ctx.fillRect(0, 0, chart.width, chart.height)
              ctx.restore()
            },
          }
        ],
        options: {
          layout: {
            padding: 35
          },
          plugins: {
            title: {
              display: true,
              text: `Comparing ${type} MMR history`,
              font: {
                weight: "bold",
                size: 40
              }
            },
            datalabels: {
              display: showValues,
              color: '#36A2EB',
              font: {
                size: 25,
              },
              formatter: function (value, context) {
                return Math.round(value)
              },
              anchor: "start",
              align: "bottom"
            },
            legend: {
              labels: {
                // This more specific font property overrides the global property
                font: {
                  size: 30
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                font: {
                  size: 30,
                }
              }
            },
            y: {
              ticks: {
                font: {
                  size: 40,
                }
              }
            }
          }
        }
      }

      const canvas = new ChartJSNodeCanvas({
        width: 1920, height: 1080,
        chartCallback: (ChartJS) => {
          ChartJS.register(ChartDataLabels)
        }
      })

      let files = [new AttachmentBuilder(await canvas.renderToBuffer(config), { name: "history.png" })]

      if (exportCsv) {
        let csv = `Date,${totalData.map(d => d.name).join(",")}\n`
        for (let i = 0; i < allDates.length; i++) {
          csv += `${allDates[i]},${totalData.map(d => d.data[i].average).join(",")}\n`
        }
        files.push(new AttachmentBuilder(Buffer.from(csv, "utf8"), { name: "history.csv" }))
      }

      if (messageId) {
        (await channel.messages.fetch(messageId)).edit({ content: interaction.user.toString(), files })
      }
      else {
        try {
          await interaction.editReply({ content: '', files })
        } catch (e) {
          await channel.send({ content: interaction.user.toString(), files })
        }
      }
    }
  }
}