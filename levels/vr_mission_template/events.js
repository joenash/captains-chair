module.exports = async function (event, world) {
  console.log(`Captains chair: ${event.name}`);

  const playerGuid = world.getContext().user.guid;
  const { player } = world.__internals.level;
  const { game } = world.__internals.level;
  console.log("Player bod", player.sprite.body);
  const username = world.getContext().settings.name;

  if (event.name === "mapDidLoad") {
    let { SyncClient } = require("twilio-sync");

    console.log("Fetching Streams");
    const teamDocuments = await getTeams(playerGuid);
    console.log("Fetching player info");
    const token = await getSyncToken(playerGuid);

    let syncClient = new SyncClient(token);
    let syncStream = await initializeStream(syncClient, playerGuid, game);

    console.log(syncStream);

    initializeDocuments(syncClient, teamDocuments, playerGuid, username);

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      const keys = [
        "w",
        "arrowup",
        "a",
        "arrowleft",
        "s",
        "arrowright",
        "d",
        "arrowdown",
      ];
      if (keys.includes(key)) {
        publishMove(syncStream, player, key);
      }
    });
  }

  console.log(event);
  console.log(world.getContext());
};

async function getSyncToken(guid) {
  console.log("Fetching token");
  const res = await fetch(`https://f63c-82-217-150-167.ngrok.io/token/${guid}`);
  const data = await res.json();
  const token = data.token;
  console.log(token);
  return token;
}

async function getTeams(guid) {
  console.log("Fetching Teams");
  const res = await fetch(`https://f63c-82-217-150-167.ngrok.io/team/${guid}`);
  const teamIds = await res.json();
  console.log(teamIds);
  return teamIds;
}

async function initializeDocuments(
  syncClient,
  documents,
  playerGuid,
  playerName
) {
  for (teamDocument of documents) {
    const document = await syncClient.document(teamDocument.uniqueName);
    console.log("Successfully opened document", document);

    document.on("updated", (event) => {
      console.log('Received an "updated" event: ', event);
    });

    const playerList = document.data.players;
    const playerIndex = playerList.findIndex(
      (player) => player.guid === playerGuid
    );
    if (playerIndex === -1) {
      console.log("player list:", playerList);
      playerList.push({ guid: playerGuid, name: playerName });
      console.log("player list updated:", playerList);
    } else {
      console.log("Player already exists");
    }

    document
      .update({ players: playerList })
      .then((value) => {
        console.log("Document update() successful, new data:", value);
      })
      .catch((error) => console.log("Failed to write to doc", error));
  }
}

async function initializeStream(syncClient, playerGuid, game) {
  let stream = await syncClient.stream(playerGuid);

  if (stream.uniqueName !== playerGuid) {
    const s = game.add.sprite(300, 400, "playerCharacter", 0);
    s.anchor.setTo(0, -0.5);
    console.log("sprite", s);
    stream.on("messagePublished", (event) => {
      console.log('Received a "messagePublished" event:', event);
      const { x, y } = event.message.data;
      s.x = x;
      s.y = y;
    });
  }

  return stream;
}

async function publishMove(stream, player, key) {
  stream
    .publishMessage({
      x: player.sprite.x,
      y: player.sprite.y,
      key,
    })
    .then((message) => {
      console.log(
        "Stream publishMessage() successful, message SID:",
        message.sid
      );
    })
    .catch((error) => {
      console.error("Stream publishMessage() failed", error);
    });
}
