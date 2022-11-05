const { Client, IntentsBitField, Partials, CommandInteractionOptionResolver } = require("discord.js")
const { Client: MultiversusClient } = require("multiversus.js")
const { MongoClient } = require('mongodb')
const { updateMethod: updateMatchHistory } = require("./commands/get_match_history.js")
const { getList: getTournamentList } = require("./commands/tournament_list.js")
const fs = require("fs")

console.log("Starting...")

require("./refresh_commands.js")()

const config = require("./config.json")

const client = new Client({ intents: new IntentsBitField([IntentsBitField.Flags.Guilds]) })

const commands = []
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"))

for (const file of commandFiles) {
  const command = require(`./commands/${file}`)
  commands.push(command)
}

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`)
  console.log(client.guilds.cache.size)
  client.MultiversusClient = new MultiversusClient(config.steamName, config.steamPassword)

  if (config.enableMongoDatabase) {
    client.MongoClient = new MongoClient(config.mongoDatabaseUrl)

    await client.MongoClient.connect()
  
    client.db = client.MongoClient.db(config.mongoDatabaseName)
    console.log("Database connected")
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.channel) return

  if (interaction.channel.parentId == "951146570047443034") {
    return interaction.reply({ ephemeral: true, content: "Use <#1003774709432852580>." })
  }

  if (!client.MultiversusClient.ready) {
    return interaction.reply("Client not ready yet. Wait a few seconds.")
  }

  for (let command of commands) {
    if (interaction.commandName == command.name) {
      command.handler(interaction)
    }
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return

  if (!client.MultiversusClient.ready) {
    return interaction.reply("Client not ready yet. Wait a few seconds.")
  }
  if (interaction.customId == "nextPage") {
    let split = interaction.message.content.split("\n")
    let [name, id, page, currentPage, startAt, type, mobile] = split[split.length - 1].slice(0, -3).split(";")
    await interaction.deferUpdate();
    updateMatchHistory(interaction, id, name, type == "null" ? null : type, parseInt(currentPage), parseInt(page) + 1, parseInt(startAt), null, mobile === "true")
  }
  else if (interaction.customId == "prevPage") {
    let split = interaction.message.content.split("\n")
    let [name, id, page, currentPage, startAt, type, mobile] = split[split.length - 1].slice(0, -3).split(";")
    await interaction.deferUpdate();
    updateMatchHistory(interaction, id, name, type == "null" ? null : type, parseInt(currentPage), parseInt(page) - 1, parseInt(startAt), true, mobile === "true")
  }
  else if (interaction.customId == "nextPageTourney") {
    await interaction.deferUpdate();
    getTournamentList(interaction, 1)
  }
  else if (interaction.customId == "prevPageTourney") {
    await interaction.deferUpdate();
    getTournamentList(interaction, -1)
  }
})

client.utils = require("./utils.js")(client)

client.login(config.token)