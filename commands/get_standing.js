const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { CharacterData, PerkData } = require("multiversus.js");
const Match = require("../structures/match");

function buildCharacterChoices() {
  const characterChoices = []
  for (let [name, data] of Object.entries(CharacterData)) {
    characterChoices.push({ name: data.displayName, value: data.id })
  }
  return characterChoices
}

function getAllMatches(interaction, id) {
  return new Promise(async (resolve, reject) => {
    let currentPage = 1
    let totalPages = 1
    let matches = []
    let userData = await interaction.client.db.collection('users').findOne({ id })
    let newestMatch
    if (userData) {
      newestMatch = userData.newestMatch
    }

    while (currentPage <= totalPages) {
      let data = await interaction.client.MultiversusClient.getMatches(id, currentPage)
      if (currentPage == 1 && data.matches[0]) {
        totalPages = data.total_pages
        if (data.matches[0].id == newestMatch)
          break
        interaction.client.db.collection('users').updateOne({ id }, { $set: { newestMatch: data.matches[0].id } }, { upsert: true })
        await interaction.editReply(`Fetching match data... This may take a while.`)
      }
      for (let match of data.matches) {
        if (match.id != newestMatch) {
          if (match.completion_time != null) matches.push(match)
        }
        else {
          currentPage = totalPages
          break
        }
      }
      currentPage++
    }

    let requests = []

    for (let match of matches) {
      if (["1v1", "2v2", "ffa"].includes(match.template.slug) && match.completion_time != null) {
        requests.push({ headers: {}, url: `/matches/${match.id}`, verb: 'GET' })
      }
    }

    let data = await interaction.client.MultiversusClient.batchRequest(requests)

    let finalMatches = []

    for (let response of data.responses) {
      if (response.body.server_data.IsCustomMatch || !response.body.server_data.PlayerData || response.body.server_data.PlayerData.some(p => p.AccountId.startsWith("bot")))
        continue

      let match = new Match(response.body)

      finalMatches.push(match)
    }

    if (finalMatches.length > 0) {
      await interaction.client.db.collection('matches').insertMany(finalMatches)
    }

    resolve()
  })
}

module.exports = {
  name: "getstanding",
  data: new SlashCommandBuilder()
    .setName("getstanding")
    .setDescription("Get the standing between two users.")
    .addStringOption(
      opt =>
        opt.setName("type")
          .setDescription("The type of standing to get")
          .setRequired(true)
          .addChoices(
            { name: '1v1s', value: '1v1' },
            { name: '2v2s', value: '2v2' },
            { name: 'ffas', value: 'ffa' }
          )
    )
    .addStringOption(
      opt =>
        opt.setName("user")
          .setDescription("The username of the first player")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("user2")
          .setDescription("The username of the second player")
          .setRequired(false)
    )
    .addStringOption(
      opt =>
        opt.setName("character")
          .setDescription("The character to check of the first player.")
          .setRequired(false)
          .addChoices(...(buildCharacterChoices()))
    )
    .addStringOption(
      opt =>
        opt.setName("character2")
          .setDescription("The character to check of the second player.")
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
    if (interaction.user.id != "353782817777385472")
      return interaction.editReply("This command has been retired until match history api is more well figured out.")
    if (!interaction.inGuild()) return
    if (!interaction.isChatInputCommand()) return
    let name = interaction.options.getString("user")
    let name2 = interaction.options.getString("user2")
    let character = interaction.options.getString("character")
    let character2 = interaction.options.getString("character2")
    let type = interaction.options.getString("type")
    let platform = interaction.options.getString("platform")
    if (!platform) platform = "wb_network"

    try {
      await interaction.deferReply()
    }
    catch (e) {
      console.error(e)
      return;
    }

    if (!character2 && !name2) {
      return interaction.editReply(`You must provide a user2 or a character2.`)
    }

    try {
      let user
      let user2
      try {
        user = await interaction.client.MultiversusClient.searchExactUsername(name, 100, null, platform)
        if (name2) user2 = await interaction.client.MultiversusClient.searchExactUsername(name2, 100, null, platform)
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
        interaction.editReply(`User ${name} not found.`)
        return
      }

      if (name2 && !user2) {
        interaction.editReply(`User ${name2} not found.`)
        return
      }

      await getAllMatches(interaction, user.account_id)

      let idSearch = [user.account_id]

      if (user2) {
        idSearch.push(user2.account_id)
      }

      let matches

      if (!character && !character2) {
        matches = (await interaction.client.db.collection('matches').find({ type, "players.id": { $all: idSearch } }).toArray())
      }
      else if (character && !character2) {
        matches = (await interaction.client.db.collection('matches').find({ type, "players.id": { $all: idSearch } }).toArray()).filter(m => m.players.some(p => p.id == user.account_id && p.character == character))
      }
      else if (!character && character2) {
        matches = (await interaction.client.db.collection('matches').find({ type, "players.id": { $all: idSearch } }).toArray()).filter(m => m.players.some(p => p.id != user.account_id && p.character == character2))
      }
      else if (character && character2) {
        matches = (await interaction.client.db.collection('matches').find({ type, "players.id": { $all: idSearch } }).toArray()).filter(m => m.players.some(p => p.id == user.account_id && p.character == character) && m.players.some(p => p.id != user.account_id && p.character == character2))
      }

      if (!matches || matches.length == 0) {
        interaction.editReply(`No matches found between ${name} and ${name2} in ${type}s.`)
        return
      }

      let wins = 0
      let totalGames = matches.length

      for (let match of matches) {
        if (match.winningTeam == match.players.find(p => p.id == user.account_id).teamIndex) wins++
      }

      if (name2) {
        interaction.editReply(`${name}${character ? ` as ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName}` : ""} has ${wins} wins out of ${totalGames} games (${(wins / totalGames * 100).toFixed(2)}%) into ${name2}${character2 ? ` as ${Object.entries(CharacterData).find((entry) => entry[1].id == character2)[1].displayName}` : ""} in ${type}s.`)
      }
      else if (character2) {
        interaction.editReply(`${name}${character ? ` as ${Object.entries(CharacterData).find((entry) => entry[1].id == character)[1].displayName}` : ""} has ${wins} wins out of ${totalGames} games (${(wins / totalGames * 100).toFixed(2)}%) into ${Object.entries(CharacterData).find((entry) => entry[1].id == character2)[1].displayName} in ${type}s.`)
      }

    }
    catch (e) {
      if (e.code == 401) {
        return interaction.editReply("Key refreshed. Please try again.")
      }
    }
  }
}