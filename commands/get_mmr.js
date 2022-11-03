const { SlashCommandBuilder, EmbedBuilder, CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, embedLength, AttachmentBuilder } = require("discord.js");
const { CharacterData } = require("multiversus.js")
const { ChartJSNodeCanvas } = require("chartjs-node-canvas")
const ChartDataLabels = require("chartjs-plugin-datalabels")
const moment = require("moment")

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
    else {
      return { matches: [], totalPages: 0 }
    }
  }

  let matches = data.matches.filter(match => (type ? match.template.name == type : ["1v1", "2v2", "ffa"].includes(match.template.slug)) && match.players.all.length >= 2 && match.completion_time != null)
  return { matches, totalPages: data.total_pages }
}

module.exports = {
  name: "getmmr",
  data: new SlashCommandBuilder()
    .setName("getmmr")
    .setDescription("Get the mmr of a user.")
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
          .setDescription("Whether to include current mmr. Defaults to true. Ignored if no start-date is provided.")
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
    ),
  handler: async (interaction) => {
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let name = interaction.options.getString("user")
    let type = interaction.options.getString("type")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"
    let startDateTemp = interaction.options.getString("start-date")
    let endDateTemp = interaction.options.getString("end-date")
    let startDate
    let endDate
    let includeNow = interaction.options.getBoolean("include-now") == null ? true : interaction.options.getBoolean("include-now")
    let multiplyConfidence = interaction.options.getBoolean("multiply-confidence") == null ? false : interaction.options.getBoolean("multiply-confidence")
    let showDeviance = interaction.options.getBoolean("show-deviation") == null ? false : interaction.options.getBoolean("show-deviation")

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

    if (!startDate && !endDate) {
      let character = interaction.options.getString("character")
      // let profile = await interaction.client.MultiversusClient.getProfile(user.id)
      if (!character) {
        let profile
        try {
          profile = await interaction.client.MultiversusClient.getProfile(user.id, type)
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

        d = {
          mmr: d.topRating.mean,
          name: user.identity.alternate.wb_network[0].username,
          confidence: d.topRating.confidence,
          deviation: d.topRating.deviance,
        }

        return interaction.editReply(`${name}'s ${type} MMR${multiplyConfidence ? " * confidence" : ""}: ${Math.round(d.mmr * (multiplyConfidence ? d.confidence : 1))}${showDeviance ? ` ± ${d.deviation}` : ""}`)
      }
      else {
        let profile = await interaction.client.MultiversusClient.getProfile(user.id, type)
        let d = profile.server_data[`${type}shuffle`]
        if (!d) {
          interaction.editReply("No data found for " + user.username)
          return
        }

        let highestKey = `${Object.keys(d).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`

        d = d[highestKey]

        d = {
          mmr: d.ratings[character].mean,
          name: user.identity.alternate.wb_network[0].username,
          confidence: d.ratings[character].confidence,
          deviation: d.ratings[character].deviance,
        }
        return interaction.editReply(`${name}'s ${type} ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName} MMR${multiplyConfidence ? " * confidence" : ""}: ${Math.round(d.mmr * (multiplyConfidence ? d.confidence : 1))}${showDeviance ? ` ± ${d.deviation}` : ""}`)
      }

    }
    else {
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

      if (!character) {
        let profile = await interaction.client.MultiversusClient.getProfile(user.id)

        let shuffleData = profile.server_data[`${type}shuffle`]

        if (!shuffleData) {
          interaction.editReply("Data not found. Try again later")
          return
        }

        let highestKey = `${Object.keys(shuffleData).map(key => parseInt(key)).sort((a, b) => b - a)[0]}`
        character = shuffleData[highestKey].topRating.character
      }

      let pageOneMatches = await getMatchHistory(interaction, user.id, type, 1)
      if (pageOneMatches.code == 401) {
        interaction.editReply("Key refreshed. Please try again.")
        return
      }

      let totalPages = pageOneMatches.totalPages

      let curPage = Math.floor(totalPages / 2)

      let matches = []

      while (true) {
        // console.log(curPage)
        if (curPage <= 0 || curPage > totalPages) {
          interaction.editReply("No matches found within range.")
          return
        }

        let midPageMatches = await getMatchHistory(interaction, user.id, type, curPage)

        if (midPageMatches.code == 401) {
          interaction.editReply("Key refreshed. Please try again.")
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
              interaction.editReply("No matches found within range.")
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
          let mat = await getMatchHistory(interaction, user.id, type, curPage + i)
          if (mat.code == 401) {
            interaction.editReply("Key refreshed. Please try again.")
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
          let mat = await getMatchHistory(interaction, user.id, type, curPage - i)
          if (mat.code == 401) {
            interaction.editReply("Key refreshed. Please try again.")
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
        interaction.editReply("No matches found.")
        return
      }

      await interaction.editReply(`Fetching match data for ${matches.length} matches. This could take a while.`)

      let nextMilestone = 20

      let times = []

      for (let i = 0; i < matches.length; i++) {
        let before = Date.now()
        matches[i] = await interaction.client.MultiversusClient.getMatch(matches[i].id)
        times.push(Date.now() - before)
        if (i / matches.length * 100 > nextMilestone) {
          await interaction.editReply(`Fetching match data for ${matches.length} matches. This could take a while. (${nextMilestone}% complete. ETA: ${Math.round(times.reduce((a, b) => a + b, 0) / times.length * (matches.length - i - 1) / 60000)} minute(s))`)
          nextMilestone += 20
        }
      }

      matches = matches.filter(m => !m.server_data.IsCustomMatch && m.data.ratingUpdates && m.data.ratingUpdates.playerRatingChanges && m.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.id) && m.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.id).postMatchRating.character == character)

      matches.sort((a, b) => new Date(a.completion_time) - new Date(b.completion_time))

      let data = await interaction.client.MultiversusClient.getProfileLeaderboardForCharacter(user.id, type, character)

      let curMmr = data.score

      let d = {}

      let increment = interaction.options.getInteger("increment") || 2

      let earliestDate = new Date(matches[0].completion_time)

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
          let mom = `${time.getFullYear()} Week ${moment(time).week()}`
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
        d[key].push(match.data.ratingUpdates.playerRatingChanges.find(p => p.playerAccountID == user.id).postMatchRating.mean)
      }

      let dataToSend = []

      for (let [key, value] of Object.entries(d)) {
        dataToSend.push({ date: key, average: Math.round(value.reduce((a, b) => a + b, 0) / value.length) })
      }

      if (includeNow) dataToSend.push({ date: "Now", average: curMmr })

      let config = {
        type: 'line',
        data: {
          labels: dataToSend.map(m => m.date),
          datasets: [{
            label: name,
            data: dataToSend.map(m => m.average),
            fill: false,
            borderColor: 'rgb(75, 192, 192)',
            tension: 0
          }]
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
              text: `${type} MMR history (${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName})`,
              font: {
                weight: "bold",
                size: 40
              }
            },
            datalabels: {
              color: '#36A2EB',
              font:
              {
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
                  size: 20
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

      interaction.editReply({ content: `History from earliest found game within range (match history seems to be periodically reset, so I can't fetch all games). Earliest match: <t:${Math.round((earliestDate.getTime()) / 1000)}:f>`, files: [new AttachmentBuilder(await canvas.renderToBuffer(config), { name: "history.png" })] })
    }
  }
}