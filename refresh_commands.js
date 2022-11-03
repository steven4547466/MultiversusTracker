const { REST } = require("@discordjs/rest")
const { Routes } = require("discord.js")
const { token } = require("./config.json")
const fs = require("fs")

const commands = []
const commandFiles = fs.readdirSync("./commands").filter(file => file.endsWith(".js"))

const clientId = "" // IMPORTANT: Set this to your client ID

for (const file of commandFiles) {
	const command = require(`./commands/${file}`)
	commands.push(command.data.toJSON())
}

const rest = new REST({ version: "10" }).setToken(token)

module.exports = (async () => {
	try {
		console.log("Started refreshing application (/) commands.")

		await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		)

		console.log("Successfully reloaded application (/) commands.")
	} catch (error) {
		console.error(error)
	}
})