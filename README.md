# MultiversusTracker
This program is not my most beautiful work, but whatever.

# Discord bot
(May be broken due to api changes)

## Prerequisites
- [Node.js](https://nodejs.org/en/) (v18 preferred)
- A discord application with a bot user account (see [dev portal](https://discord.com/developers/applications))
- A secondary steam user that has ran multiversus at least once

#### Optionals
- pm2 (or another process manager)

## Installing node
The first thing you'll need is to install node.js. This is easy on most systems:

#### Windows
Head to https://nodejs.org/en/ and download the latest LTS release (v18 at the time of writing) and follow the setup wizard.

#### Linux
I recommend using [node version manager](https://github.com/nvm-sh/nvm) (nvm). However, node lts can be installed simply on most linux distrubutions using the following command sequence:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - &&\
sudo apt-get install -y nodejs
```

### Setting up a discord bot
This is relatively simple. Head to the discord dev portal (https://discord.com/developers/applications) and make a new application. Add a bot user and copy the token. Edit the `config.json` and paste the token in the corresponding field.

### Secondary steam account
The api works by using a steam user to use the backend private api. You'll need a steam account you won't log into often as every time you start the game on the steam account the bot will need to need its key refreshed which will automatically happen if you restart the program.

So, make a steam account, play multiversus once (make sure it actually has access to the game and can play online) and add the username and password to their respective fields in `config.json`, in this case `steamName` and `steamPassword` (not the matches fields, that's for the match tracker).

### Starting the bot
Starting the bot is simple. If you followed all steps to this point, all you will need to do is run `npm install` in the root directory of the project and then `node index.js`.

#### Extras

##### PM2
PM2 is a process manager that makes it easy to run tasks in the background (I've never used it on windows, no idea if it works in that environment). You can download pm2 using npm: `npm install pm2 -g`. This installs the package globally so it can be used anywhere.

Once you have pm2 you can start the bot using `pm2 start index.js`. You can add an optional name to the process using `--name MultiversusTracker`. I advise if you use this then you read up on pm2.

#### Mongo
I built the bot to use a mongo database to link user accounts. I've made this optional to enable in `config.json`. You *must* have a mongo database running for this to work. If disabled, the link feature will be unavailable.

Mongo is required if you wish to use the match tracker.


# Match tracker
The match tracker is a unique program. You most likely won't get any value out of it unless you understand mongo enough to query it. I will not be teaching this as I don't find myself qualified to do so.

As long as you have mongo enabled and it works with the bot, all you need to do is run the `matchTracker.js` file using either pm2, or any other process manager you want.

I cannot guarantee this still works as the api was recently changed.

I am aware there is a memory leak somewhere in the match tracker that causes it to restart every so often, but I never managed to track it down. I recommend setting it up to auto restart and just give it a specific amount of memory so it doesn't thrash your system.

The match tracker also requires another steam user with multiversus access (it cannot be the same as the bot as they will reset their tokens when the other one logs in, it must be unique. You put the steam name and password in their respective fields in `config.json` (`steamNameMatches` and `steamPasswordMatches`).

If you have the technical knowhow, you can edit what the match tracker tracks by editing the class in the `structures/match.js` file. This requires knowing what the api returns and how it's structured.