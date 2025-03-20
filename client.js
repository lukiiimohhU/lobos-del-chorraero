let socket;
let gameId = null;
let playerId = null;
let playerRole = null;
let isHost = false;
let isAlive = true;
let cardFlipped = false;
let selectedPlayerId = null;
let hasVoted = false;

function connectToServer() {
  socket = io('https://juegolobo-backend.onrender.com', { // URL BACKEND
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    query: { playerId: localStorage.getItem('playerId'), gameId: localStorage.getItem('gameId') },
  });
  
  socket.on('connect', () => {
    console.log('Conectado al servidor con socket.id:', socket.id);
    playerId = localStorage.getItem('playerId') || socket.id;
    socket.playerId = playerId; // Establecer explícitamente
    restoreOrStartSession();
    if (playerId && gameId && isHost) socket.emit('updateHostSocket', { gameId, playerId });
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Desconectado del servidor:', reason);
    showMessage('Desconectado del servidor. Intentando reconectar...', 'error');
  });
  
  socket.on('reconnect', () => {
    console.log('Reconectado al servidor con socket.id:', socket.id);
    restoreOrStartSession();
    console.log('Estado tras reconexión, hasVoted:', hasVoted); // Log para depurar
    if (playerId && gameId && isHost) {
      socket.emit('updateHostSocket', { gameId, playerId });
    }
  });

  socket.on('kickedFromGame', (data) => {
    showMessage(data.message, 'error'); // Mostrar "Has sido expulsado de la sala" en rojo
    localStorage.removeItem('gameSession'); // Limpiar sesión
    localStorage.removeItem('playerId');
    gameId = null;
    playerId = null;
    isHost = false;
    showScreen('home'); // Volver a la pantalla principal
  });

  socket.on('playerKicked', (data) => {
    showMessage(`${data.name} ha sido expulsado de la partida`, 'warning');
    handleUpdatePlayers(data.players);
  });
  
  socket.on('resetVotes', () => {
    hasVoted = false;
    localStorage.setItem('hasVoted', 'false');
    resetActionButtons();
    const gameplayArea = document.querySelector('.gameplay-area');
    if (gameplayArea) {
      gameplayArea.classList.remove('locked');
    }
  });

  socket.on('gameCancelled', () => {
    localStorage.removeItem('gameSession');
    localStorage.removeItem('playerId');
    gameId = null;
    playerId = null;
    isHost = false;
    showScreen('home');
    showMessage('La sala ha sido cancelada por el anfitrión', 'warning');
  });

  socket.on('showMessage', (data) => {
    // Solo mostrar si no es un mensaje de nightEnd o dayEnd (opcional, según otros usos)
    if (!data.message.includes('muerto esta noche') && !data.message.includes('eliminado')) {
      showMessage(data.message, data.type);
    }
  });
  socket.on('gameCreated', handleGameCreated);
  socket.on('gameJoined', handleGameJoined);
  socket.on('error', handleError);
  socket.on('updatePlayers', handleUpdatePlayers);
  socket.on('gameStarted', handleGameStarted);
  socket.on('hostGameStarted', handleHostGameStarted);
  socket.on('roleAssigned', handleRoleAssigned);
  socket.on('updateGameState', (data) => {
    console.log('Recibido updateGameState:', data); // Depurar datos
    handleUpdateGameState(data);
  });
  socket.on('cardFlipped', handleCardFlipped);
  socket.on('gameOver', handleGameOver);
  socket.on('playerDisconnected', handlePlayerDisconnected);
  socket.on('playerReconnected', handlePlayerReconnected);
  socket.on('sessionRestored', handleSessionRestored);
  socket.on('gameReset', handleGameReset);
  socket.on('displayPlayerRole', handleDisplayPlayerRole);
  socket.on('playersList', (players) => {
    const list = document.getElementById('managePlayersList');
    if (!list) {
      console.error('No se encontró #managePlayersList');
      return;
    }
    console.log('Datos crudos de playersList:', players);
    const nonHostPlayers = players.filter(p => !p.isHost && !p.disconnected);
    console.log('Jugadores no anfitriones en managePlayers:', nonHostPlayers);
    list.innerHTML = '';
    if (nonHostPlayers.length === 0) {
      list.innerHTML = '<p>No hay jugadores para mostrar.</p>';
    }
    nonHostPlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'manage-player-item';
      const toggleButton = document.createElement('button');
      toggleButton.className = `toggle-status ${player.alive ? '' : 'revive'}`;
      toggleButton.dataset.id = player.id;
      toggleButton.textContent = player.alive ? 'Matar' : 'Revivir';
  
      item.innerHTML = `<span>${player.name} - ${player.alive ? 'Vivo' : 'Muerto'}</span>`;
      item.appendChild(toggleButton);
      list.appendChild(item);
  
      toggleButton.addEventListener('click', () => {
        const playerId = toggleButton.dataset.id;
        const isCurrentlyAlive = toggleButton.textContent === 'Matar';
        const newAlive = !isCurrentlyAlive;
  
        toggleButton.textContent = newAlive ? 'Matar' : 'Revivir';
        toggleButton.className = `toggle-status ${newAlive ? '' : 'revive'}`;
        const span = toggleButton.previousElementSibling;
        span.textContent = `${player.name} - ${newAlive ? 'Vivo' : 'Muerto'}`;
  
        socket.emit('updatePlayerStatus', { gameId, playerId, alive: newAlive });
      });
    });
  });
  socket.on('voteUpdate', handleVoteUpdate);
  socket.on('nightEnd', (data) => {
    console.log('Recibido nightEnd en cliente:', JSON.stringify(data)); // Log para verificar
    handleNightEnd(data);
  });
  socket.on('dayEnd', (data) => {
    console.log('Recibido dayEnd en cliente:', JSON.stringify(data)); // Log para verificar
    handleDayEnd(data);
  });
}

function restoreOrStartSession() {
  const savedData = JSON.parse(localStorage.getItem('gameSession')) || {};
  const playerId = savedData.playerId;
  const gameId = savedData.gameId;
  const isHost = savedData.isHost || false;

  console.log('Restaurando sesión:', { playerId, gameId, isHost });

  if (playerId && gameId) {
    socket.emit('restoreSession', { playerId, gameId });
    document.getElementById('gameCodeDisplay').textContent = gameId;
  } else {
    showScreen('home');
  }
}

function saveSession() {
  if (playerId && gameId) {
    localStorage.setItem('gameSession', JSON.stringify({ playerId, gameId, isHost }));
    localStorage.setItem('playerId', playerId);
    localStorage.setItem('hasVoted', hasVoted); // Guardar estado de votación
  }
}

function toggleKickList() {
  const kickList = document.getElementById('kickList');
  if (kickList.style.display === 'none' || kickList.style.display === '') {
    socket.emit('requestPlayers', gameId);
    socket.once('playersList', (players) => {
      kickList.innerHTML = '';
      const nonHostPlayers = players.filter(p => !p.isHost && !p.disconnected);
      nonHostPlayers.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'kick-item';
        playerItem.innerHTML = `
          ${player.name}
          <button class="kick-player-button" data-id="${player.id}">Expulsar</button>
        `;
        kickList.appendChild(playerItem);
      });
      document.querySelectorAll('.kick-player-button').forEach(button => {
        button.addEventListener('click', () => {
          const targetId = button.dataset.id;
          socket.emit('kickPlayer', { gameId, targetId });
          kickList.style.display = 'none';
        });
      });
      kickList.style.display = 'block';
    });
  } else {
    kickList.style.display = 'none';
  }
}

function handleKickPlayersList(players) {
  const kickList = document.getElementById('kickList');
  kickList.innerHTML = '';
  const nonHostPlayers = players.filter(p => !p.isHost && !p.disconnected);
  nonHostPlayers.forEach(player => {
    const playerItem = document.createElement('div');
    playerItem.className = 'kick-item';
    playerItem.innerHTML = `
      ${player.name}
      <button class="kick-player-button" data-id="${player.id}">Expulsar</button>
    `;
    kickList.appendChild(playerItem);
  });

  // Añadir evento a los botones de expulsión
  document.querySelectorAll('.kick-player-button').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.id;
      socket.emit('kickPlayer', { gameId, targetId });
      kickList.style.display = 'none'; // Ocultar el listado tras expulsar
    });
  });
}

function initializeGameEvents() {
  if (isHost) {
    const advancePhaseButton = document.getElementById('hostAdvancePhase');
    const managePlayersButton = document.getElementById('hostManagePlayers');
    const showRolesButton = document.getElementById('hostShowRoles');
    const returnToLobbyButton = document.getElementById('hostReturnToLobby');

    console.log('Inicializando eventos del host:', { advancePhaseButton, managePlayersButton, showRolesButton, returnToLobbyButton });

    if (advancePhaseButton) {
      advancePhaseButton.removeEventListener('click', advancePhaseHandler);
      advancePhaseButton.addEventListener('click', advancePhaseHandler);
    } else {
      console.error('No se encontró #hostAdvancePhase');
    }

    if (managePlayersButton) {
      managePlayersButton.removeEventListener('click', showManagePlayers);
      managePlayersButton.addEventListener('click', showManagePlayers);
    } else {
      console.error('No se encontró #hostManagePlayers');
    }

    if (showRolesButton) {
      showRolesButton.removeEventListener('click', showPlayerRoles);
      showRolesButton.addEventListener('click', showPlayerRoles);
    } else {
      console.error('No se encontró #hostShowRoles');
    }

    if (returnToLobbyButton) {
      returnToLobbyButton.removeEventListener('click', playAgain);
      returnToLobbyButton.addEventListener('click', playAgain);
    } else {
      console.error('No se encontró #hostReturnToLobby');
    }
  } else {
    const roleCard = document.getElementById('roleCard');
    if (roleCard) {
      roleCard.removeEventListener('click', flipCard);
      roleCard.addEventListener('click', flipCard);
    } else {
      console.error('No se encontró #roleCard');
    }
  }
}

// Función auxiliar para el evento de avanzar fase
function advancePhaseHandler() {
  console.log('Botón Avanzar Fase clicado', { gameId });
  if (gameId) {
    socket.emit('advancePhase', gameId);
  } else {
    console.error('gameId no está definido al intentar avanzar fase');
  }
}

function handleGameCreated(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  isHost = true;
  saveSession();
  document.getElementById('gameCodeDisplay').textContent = gameId;
  showScreen('lobby');

  const kickContainer = document.getElementById('kickContainer');
  kickContainer.style.display = 'block';
  kickContainer.innerHTML = `
    <div class="button-container">
      <button id="startButton" class="main-button"><i class="fas fa-play"></i> Comenzar partida</button>
      <button id="kickButton" class="main-button kick-button"><i class="fas fa-door-open"></i> Expulsar</button>
      <button id="cancelButton" class="main-button cancel-button"><i class="fas fa-times"></i> Cancelar Sala</button>
    </div>
    <div id="kickList" class="kick-list" style="display: none;"></div>
  `;
  
  document.getElementById('startButton').addEventListener('click', startGame);
  document.getElementById('kickButton').addEventListener('click', toggleKickList);
  document.getElementById('cancelButton').addEventListener('click', cancelGame);
}

function handleGameJoined(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  isHost = false;
  saveSession();
  document.getElementById('gameCodeDisplay').textContent = gameId;
  showScreen('lobby');

  // Ocultar el contenedor de botones para no anfitriones
  const kickContainer = document.getElementById('kickContainer');
  kickContainer.style.display = 'none';
  kickContainer.innerHTML = ''; // Limpiar contenido para evitar residuos
}

function handleSessionRestored(data) {
  gameId = data.gameId;
  playerId = data.playerId;
  playerRole = data.role;
  isHost = data.isHost;
  isAlive = data.alive;
  hasVoted = data.hasVoted || false;
  console.log('Sesión restaurada, hasVoted:', hasVoted);
  localStorage.setItem('hasVoted', hasVoted.toString());
  cardFlipped = false;
  saveSession();

  console.log('Sesión restaurada:', { gameId, playerId, isHost, socketId: socket.id });
  console.log('Evaluando estado:', { isHost, gameState: data.state.state });

  document.getElementById('gameCodeDisplay').textContent = gameId;

  // Forzar lobby si el estado no es 'playing' o no está definido
  const isLobbyState = !data.state.state || data.state.state === 'lobby';

  if (isHost) {
    if (data.state.state === 'lobby') {
      console.log('Host en lobby: mostrando #lobbyScreen');
      showScreen('lobby');
      const kickContainer = document.getElementById('kickContainer');
      kickContainer.style.display = 'block';
      kickContainer.innerHTML = `
        <div class="button-container">
          <button id="startButton" class="main-button"><i class="fas fa-play"></i> Comenzar partida</button>
          <button id="kickButton" class="main-button kick-button">Expulsar</button>
          <button id="cancelButton" class="main-button cancel-button"><i class="fas fa-times"></i> Cancelar Sala</button>
        </div>
        <div id="kickList" class="kick-list" style="display: none;"></div>
      `;
      document.getElementById('startButton').addEventListener('click', startGame);
      document.getElementById('kickButton').addEventListener('click', toggleKickList);
      document.getElementById('cancelButton').addEventListener('click', cancelGame);
      handleUpdatePlayers(data.state.players);
    } else {
      console.log('Host en juego: mostrando #hostScreen');
      showScreen('host');
      handleHostGameStarted({ players: data.state.players });
      handleUpdateGameState(data.state);
      initializeGameEvents(); // Ya está aquí
    }
    // Actualizar el socket del host en el servidor
    socket.emit('updateHostSocket', { gameId, playerId });
  } else if (data.state.state === 'lobby') {
    console.log('Jugador no host en lobby: mostrando #lobbyScreen');
    showScreen('lobby');
    const kickContainer = document.getElementById('kickContainer');
    kickContainer.style.display = 'none';
    kickContainer.innerHTML = '';
    handleUpdatePlayers(data.state.players);
  } else {
    showScreen('game');
    handleRoleAssigned({ role: playerRole });
    handleUpdateGameState(data.state);
    const roleCard = document.getElementById('roleCard');
    roleCard.classList.remove('flipping');
    document.getElementById('playerRole').textContent = '-';
    document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
    initializeGameEvents();
    if (hasVoted && data.state.time === 'day') {
      lockGameplayArea();
      disablePlayerSelection();
    }
  }
  showMessage('Sesión restaurada con éxito', 'success');
  updateControls(data.state.time);
}

function handleGameReset(data) {
  gameId = data.gameId;
  playerRole = null;
  isAlive = true;
  cardFlipped = false;
  saveSession();
  showScreen('lobby');
  document.getElementById('gameCodeDisplay').textContent = gameId;

  const kickContainer = document.getElementById('kickContainer');
  if (isHost) {
    kickContainer.style.display = 'block';
    kickContainer.innerHTML = `
      <div class="button-container">
        <button id="startButton" class="main-button"><i class="fas fa-play"></i> Comenzar partida</button>
        <button id="kickButton" class="main-button kick-button"><i class="fas fa-door-open"></i> Expulsar</button>
        <button id="cancelButton" class="main-button cancel-button"><i class="fas fa-times"></i> Cancelar Sala</button>
      </div>
      <div id="kickList" class="kick-list" style="display: none;"></div>
    `;
    document.getElementById('startButton').addEventListener('click', startGame);
    document.getElementById('kickButton').addEventListener('click', toggleKickList);
    document.getElementById('cancelButton').addEventListener('click', cancelGame);
  } else {
    kickContainer.style.display = 'none';
    kickContainer.innerHTML = '';
  }

  handleUpdatePlayers(data.players);
  showMessage('Partida reiniciada', 'success');
}

function handlePlayerReconnected(data) {
  showMessage(`Jugador ${data.name} se ha reconectado`, 'success');
}

function handleError(data) {
  console.log('Error recibido:', data);
  if (data.type === 'insufficientPlayers') {
    showMessage(data.message, 'error'); // Solo mostrar notificación
  } else if (data.message === 'Ya has votado en esta ronda. No puedes cambiar tu voto.') {
    showMessage(data.message, 'warning'); // Mostrar mensaje sin desconectar
  } else {
    showMessage(data.message, 'error');
    localStorage.removeItem('gameSession');
    localStorage.removeItem('playerId');
    showScreen('home'); // Solo para errores graves
  }
}

function handleUpdatePlayers(players) {
  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  players.forEach(player => {
    if (!player.disconnected) {
      const playerItem = document.createElement('div');
      playerItem.className = 'player-item';
      playerItem.textContent = player.name + (player.isHost ? ' (Anfitrión)' : '');
      playerList.appendChild(playerItem);
    }
  });
  if (isHost) {
    updateHostPlayersList(players); // Actualizar la lista del host con roles
  }
}

function cancelGame() {
  socket.emit('cancelGame', { gameId });
}

function handleGameStarted() {
  if (!isHost) {
    showScreen('game');
    cardFlipped = false; // Reiniciar estado
    const roleCard = document.getElementById('roleCard');
    roleCard.classList.remove('flipping');
    document.getElementById('playerRole').textContent = '-';
    document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
    initializeGameEvents();
  }
  showMessage('¡El juego ha comenzado!', 'info');
}

function handleHostGameStarted(data) {
  showScreen('host');
  initializeGameEvents(); // Inicializar eventos al empezar
  showMessage('¡Controla la partida desde aquí!', 'info');
  document.getElementById('hostGameDay').textContent = 1;
  document.getElementById('hostGameTime').textContent = 'Noche';
  updateHostPlayersList(data.players);
}

function handleRoleAssigned(data) {
  playerRole = data.role;
  const roleElement = document.getElementById('playerRole');
  const roleImageElement = document.getElementById('roleImage');
  cardFlipped = false; // Asegurar estado inicial
  roleElement.textContent = '-';
  roleImageElement.src = `images/${playerRole}.png`;
  roleImageElement.alt = translateRole(playerRole);
  document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
  document.getElementById('roleCard').classList.remove('flipping'); // Quitar clase flipping
}

function handleCardFlipped() {
  const roleCard = document.getElementById('roleCard');
  cardFlipped = !cardFlipped;
  if (cardFlipped) {
    roleCard.classList.add('flipping');
    document.getElementById('playerRole').textContent = translateRole(playerRole);
    document.getElementById('roleDescription').textContent = getRoleDescription(playerRole);
    document.getElementById('roleDescription').style.display = 'block';
  } else {
    roleCard.classList.remove('flipping');
    document.getElementById('playerRole').textContent = '-';
    document.getElementById('roleDescription').textContent = 'Haz clic en la carta para voltearla';
  }
}

function handleUpdateGameState(state) {
  console.log('Recibido updateGameState:', state);
  if (isHost) {
    if (state.state !== 'lobby') {
      showScreen('host');
    }
    document.getElementById('hostGameDay').textContent = state.day;
    document.getElementById('hostGameTime').textContent = translateTime(state.time);
    updateHostPlayersList(state.players);
  } else {
    handleUpdatePlayers(state.players);
    document.getElementById('gameDay').textContent = state.day;
    document.getElementById('gameTime').textContent = translateTime(state.time);
    isAlive = state.players.find(p => p.id === playerId)?.alive ?? true;
    const roleCross = document.getElementById('roleCross');
    roleCross.style.display = isAlive ? 'none' : 'block';

    const playersList = document.getElementById('gamePlayersList');
    playersList.innerHTML = '';
    state.players.forEach(player => {
      if (!player.isHost && player.alive) {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player.id === playerId) playerItem.classList.add('self');
        playerItem.textContent = player.name;
        playerItem.dataset.id = player.id;
        if (state.time === 'day' && isAlive && player.id !== playerId && !hasVoted) {
          playerItem.addEventListener('click', () => selectPlayer(player.id, player.name));
        } else {
          playerItem.classList.add('disabled');
        }
        playersList.appendChild(playerItem);
      }
    });

    if (hasVoted && state.time === 'day') {
      lockGameplayArea(); // Asegurar bloqueo si ya votó
      disablePlayerSelection();
    }
    updateControls(state.time);
  }
}

function handleDisplayPlayerRole(data) {
  const roleOverlay = document.getElementById('roleOverlay');
  document.getElementById('overlayPlayerName').textContent = data.name;
  document.getElementById('overlayPlayerRole').textContent = translateRole(data.role);
  document.getElementById('overlayRoleImage').src = `images/${data.role}.png`;
  roleOverlay.style.display = 'flex';
}

function handlePlayersList(players) {
  // Esta función no hace nada aquí, se usa en showManagePlayers y showPlayerRoles directamente
}

function handleVoteUpdate(data) {
  showMessage(`${data.playerName} ha votado contra ${data.targetName}`, 'info');
}

function handleNightEnd(data) {
  console.log('Recibido nightEnd en cliente:', JSON.stringify(data));
  showMessage(data.message, data.type);
}

function handleDayEnd(data) {
  console.log('Recibido dayEnd en cliente:', JSON.stringify(data));
  showMessage(data.message, data.type);
  resetActionButtons();
  console.log('Estado de votación tras resetActionButtons:', { hasVoted });
}

function updateHostPlayersList(players) {
  const playerList = document.getElementById('hostPlayerList');
  if (!playerList) {
    console.error('El elemento #hostPlayerList no se encuentra en el DOM');
    return;
  }

  console.log('Jugadores recibidos:', players); // Depurar datos crudos
  playerList.innerHTML = '';
  const nonHostPlayers = players.filter(player => !player.isHost);
  console.log('Jugadores no anfitriones:', nonHostPlayers); // Verificar filtro
  nonHostPlayers.forEach(player => {
    const playerItem = document.createElement('div');
    playerItem.className = 'host-player-item';

    const roleImage = player.role ? `images/${player.role}.png` : 'images/player.png';
    const roleText = player.role ? translateRole(player.role) : 'Sin rol';

    playerItem.innerHTML = `
      <img src="${roleImage}" alt="${roleText}" class="player-icon">
      <span>${player.name} (${roleText}) - ${player.alive ? 'Vivo' : 'Muerto'}</span>
    `;
    playerList.appendChild(playerItem);
  });
}

function handleGameOver(data) {
  let message = data.winner === 'werewolves' ? '¡Los Lobos han ganado!' : '¡Los Aldeanos han ganado!';
  let rolesInfo = '';
  data.roles.forEach(p => {
    rolesInfo += `<div><img src="images/${p.role}.png" class="role-icon"> ${p.name}: ${translateRole(p.role)}</div>`;
  });
  document.getElementById('gameOverMessage').innerHTML = message;
  document.getElementById('gameOverRoles').innerHTML = rolesInfo;
  showScreen('gameOver');
  //localStorage.removeItem('gameSession');
  //localStorage.removeItem('playerId');

  // Mostrar el botón "Jugar de nuevo" solo para el anfitrión
  const playAgainButton = document.getElementById('playAgainButton');
  playAgainButton.style.display = isHost ? 'block' : 'none';
}

function handlePlayerDisconnected(data) {
  showMessage(`${data.name} se ha desconectado`, 'warning');
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.style.display = 'none');
  document.getElementById(screenId + 'Screen').style.display = 'block';
}

function showMessage(message, type = 'info') {
  console.log('Mostrando mensaje en cliente:', { message, type });
  const messageContainer = document.getElementById('messageContainer');
  if (!messageContainer) {
    console.error('No se encontró #messageContainer en el DOM');
    return;
  }
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  messageContainer.appendChild(messageElement);
  setTimeout(() => {
    messageElement.classList.add('fade-out');
    setTimeout(() => {
      if (messageElement.parentNode) {
        messageContainer.removeChild(messageElement);
      }
    }, 1000);
  }, 5000);
}

function translateRole(role) {
  const roles = {
    'werewolf': 'Lobo',
    'villager': 'Aldeano',
    'seer': 'Vidente',
    'doctor': 'Protector',
    'witch': 'Bruja',
    'hunter': 'Cazador',
    'girl': 'Niña',
    'cupid': 'Cupido',
    'fox': 'Zorro',
  };
  return roles[role] || role;
}

function getRoleDescription(role) {
  const descriptions = {
    'werewolf': 'Tu objetivo es eliminar a todos los aldeanos.',
    'villager': 'Tu objetivo es descubrir quiénes son los lobos.',
    'seer': 'Puedes descubrir el rol de un jugador al inicio de cada ronda.',
    'doctor': 'Puedes proteger a un jugador del ataque de los lobos.',
    'witch': 'Usa pociones para revivir o matar en función de lo que te diga la madre.',
    'hunter': 'Si mueres, puedes eliminar a un jugador directamente.',
    'girl': 'En la ronda de los lobos puedes abrir los ojos SIN QUE SE NOTE y recopilar información',
    'cupid': 'Une a dos jugadores en amor.',
    'fox': 'Investiga si hay lobos cerca.',
  };
  return descriptions[role] || 'Sin descripción disponible.';
}

function translateTime(time) {
  return time === 'day' ? 'Día' : 'Noche';
}

function flipCard() {
  socket.emit('flipCard', { gameId, playerId });
}

function updateControls(time) {
  console.log('Actualizando controles, tiempo:', time, 'hasVoted:', hasVoted);
  const actionButtons = document.getElementById('actionButtons');
  const gameplayArea = document.querySelector('.gameplay-area');
  actionButtons.innerHTML = '';

  if (!isAlive) {
    const actionText = document.createElement('div');
    actionText.textContent = 'Estás muerto. No puedes realizar acciones.';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);
    gameplayArea.classList.add('locked');
    return;
  }

  if (time === 'day') {
    const actionText = document.createElement('div');
    actionText.textContent = hasVoted ? 'Ya has votado en esta ronda.' : 'Vota por alguien para eliminar:';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirmar voto';
    confirmButton.className = 'action-button';
    confirmButton.id = 'confirmButton';
    confirmButton.disabled = hasVoted || !selectedPlayerId;
    confirmButton.onclick = () => {
      if (selectedPlayerId && !hasVoted) confirmVote();
    };
    actionButtons.appendChild(confirmButton);

    if (hasVoted) {
      lockGameplayArea();
      disablePlayerSelection();
    } else {
      gameplayArea.classList.remove('locked');
      const players = document.querySelectorAll('.player-item:not(.self)');
      players.forEach(player => {
        player.classList.remove('disabled');
        player.addEventListener('click', () => selectPlayer(player.dataset.id, player.textContent));
      });
    }
  } else {
    const actionText = document.createElement('div');
    actionText.textContent = 'Es de noche. Espera al día para votar.';
    actionText.className = 'action-text';
    actionButtons.appendChild(actionText);
    gameplayArea.classList.remove('locked');
  }
}

function selectPlayer(id, name) {
  if (hasVoted) {
    showMessage('Ya has votado en esta ronda. No puedes cambiar tu selección.', 'warning');
    return;
  }
  const previousSelected = document.querySelector('.player-item.selected');
  if (previousSelected) previousSelected.classList.remove('selected');
  const playerElement = document.querySelector(`.player-item[data-id="${id}"]`);
  if (playerElement) {
    playerElement.classList.add('selected');
    selectedPlayerId = id;
    const confirmButton = document.getElementById('confirmButton');
    if (confirmButton) confirmButton.disabled = false;
  }
}

function confirmVote() {
  if (!selectedPlayerId) {
    showMessage('Por favor, selecciona un jugador antes de confirmar.', 'error');
    return;
  }
  if (hasVoted) {
    showMessage('Ya has votado en esta ronda.', 'warning');
    return;
  }
  console.log('Enviando voto:', { gameId, targetId: selectedPlayerId });
  socket.emit('dayVote', { gameId, targetId: selectedPlayerId });
  hasVoted = true;
  localStorage.setItem('hasVoted', 'true');
  disablePlayerSelection();
  lockGameplayArea();
  const gameplayTime = document.getElementById('gameTime').textContent.toLowerCase() === 'día' ? 'day' : 'night';
  updateControls(gameplayTime); // Actualizar inmediatamente
  showMessage(`Has votado por ${document.querySelector(`.player-item[data-id="${selectedPlayerId}"]`).textContent}`, 'info');
}

function lockGameplayArea() {
  const gameplayArea = document.querySelector('.gameplay-area');
  if (gameplayArea) {
    gameplayArea.classList.add('locked');
    console.log('Gameplay area bloqueada');
  }
}

function disablePlayerSelection() {
  const players = document.querySelectorAll('.player-item');
  players.forEach(player => {
    player.removeEventListener('click', selectPlayer);
    player.classList.add('disabled');
  });
  const confirmButton = document.getElementById('confirmButton');
  if (confirmButton) confirmButton.disabled = true;
}

function resetActionButtons() {
  selectedPlayerId = null;
  hasVoted = false;
  localStorage.setItem('hasVoted', 'false'); // Reiniciar
  const players = document.querySelectorAll('.player-item');
  players.forEach(player => {
    player.classList.remove('selected');
    player.classList.remove('disabled');
    if (!player.classList.contains('self')) {
      player.addEventListener('click', () => selectPlayer(player.dataset.id, player.textContent));
    }
  });
  const confirmButton = document.getElementById('confirmButton');
  if (confirmButton) confirmButton.disabled = true;
}

function showManagePlayers() {
  const modal = document.getElementById('managePlayersModal');
  const list = document.getElementById('managePlayersList');
  
  if (!modal || !list) {
    console.error('No se encontraron elementos:', { modal, list });
    return;
  }

  modal.style.display = 'block';
  list.innerHTML = '<p>Cargando jugadores...</p>'; // Indicador de carga
  socket.emit('requestPlayers', gameId);

  // Usa un listener específico y temporal
  socket.once('playersListForManage', (players) => {
    console.log('Datos recibidos para gestionar jugadores:', players);
    const nonHostPlayers = players.filter(p => !p.isHost && !p.disconnected);
    console.log('Jugadores no anfitriones:', nonHostPlayers);
    list.innerHTML = '';
    if (nonHostPlayers.length === 0) {
      list.innerHTML = '<p>No hay jugadores para mostrar.</p>';
    }
    nonHostPlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'manage-player-item';
      const toggleButton = document.createElement('button');
      toggleButton.className = `toggle-status ${player.alive ? '' : 'revive'}`;
      toggleButton.dataset.id = player.id;
      toggleButton.textContent = player.alive ? 'Matar' : 'Revivir';

      item.innerHTML = `<span>${player.name} - ${player.alive ? 'Vivo' : 'Muerto'}</span>`;
      item.appendChild(toggleButton);
      list.appendChild(item);

      toggleButton.addEventListener('click', () => {
        const playerId = toggleButton.dataset.id;
        const isCurrentlyAlive = toggleButton.textContent === 'Matar';
        const newAlive = !isCurrentlyAlive;

        toggleButton.textContent = newAlive ? 'Matar' : 'Revivir';
        toggleButton.className = `toggle-status ${newAlive ? '' : 'revive'}`;
        const span = toggleButton.previousElementSibling;
        span.textContent = `${player.name} - ${newAlive ? 'Vivo' : 'Muerto'}`;

        socket.emit('updatePlayerStatus', { gameId, playerId, alive: newAlive });
      });
    });
  });
}

function showPlayerRoles() {
  socket.emit('requestPlayers', gameId);
  socket.once('playersListForRoles', (players) => {
    console.log('Datos recibidos para mostrar roles:', players); // Añade este log para depurar
    const modal = document.getElementById('playerRolesModal');
    const playerList = document.getElementById('playerRolesList');
    if (!modal || !playerList) {
      console.error('No se encontraron elementos:', { modal, playerList });
      return;
    }
    playerList.innerHTML = '';
    const alivePlayers = players.filter(p => !p.isHost && p.alive && !p.disconnected);
    console.log('Jugadores vivos no anfitriones:', alivePlayers); // Añade este log
    if (alivePlayers.length === 0) {
      playerList.innerHTML = '<p>No hay jugadores vivos para mostrar.</p>';
    }
    alivePlayers.forEach(player => {
      const div = document.createElement('div');
      div.className = 'player-item modal-player-item';
      div.textContent = player.name;
      div.onclick = () => {
        socket.emit('showPlayerRole', { gameId, playerId: player.id });
        closeModal();
      };
      playerList.appendChild(div);
    });
    modal.style.display = 'flex';
  });
}

function togglePlayerStatus(playerId, alive) {
  socket.emit('updatePlayerStatus', { gameId, playerId, alive });
  closeModal();
}

function closeModal() {
  document.getElementById('managePlayersModal').style.display = 'none';
  document.getElementById('playerRolesModal').style.display = 'none';
}

function closeManagePlayers() {
  const modal = document.getElementById('managePlayersModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function hideRoleOverlay() {
  document.getElementById('roleOverlay').style.display = 'none';
}

function createGame() {
  const playerName = document.getElementById('playerNameCreate').value.trim();
  if (!playerName) return showMessage('Introduce tu nombre', 'error');
  socket.emit('createGame', playerName);
}

function joinGame() {
  const playerName = document.getElementById('playerNameJoin').value.trim();
  const gameCode = document.getElementById('gameCode').value.trim();
  if (!playerName || !gameCode) return showMessage('Introduce tu nombre y el código', 'error');
  socket.emit('joinGame', { gameId: gameCode, playerName });
}

function startGame() {
  socket.emit('startGame', { gameId, playerId });
}

function playAgain() {
  if (gameId) {
    socket.emit('playAgain', gameId);
    console.log('Emitiendo playAgain con gameId:', gameId); // Para depuración
  } else {
    console.error('No se puede reiniciar: gameId no está definido');
    showMessage('Error: No se pudo volver al lobby. Intenta crear una nueva partida.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  connectToServer();

  const createGameButton = document.getElementById('createGameButton');
  const joinGameButton = document.getElementById('joinGameButton');
  const createGameForm = document.getElementById('createGameForm');
  const joinGameForm = document.getElementById('joinGameForm');

  function showCreateForm() {
    createGameForm.style.display = 'block';
    joinGameForm.style.display = 'none';
  }

  function showJoinForm() {
    createGameForm.style.display = 'none';
    joinGameForm.style.display = 'block';
  }

  createGameButton.addEventListener('click', showCreateForm);
  createGameButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    showCreateForm();
  });

  joinGameButton.addEventListener('click', showJoinForm);
  joinGameButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    showJoinForm();
  });

  document.getElementById('submitCreateGame').addEventListener('click', createGame);
  document.getElementById('submitJoinGame').addEventListener('click', joinGame);
  document.getElementById('playAgainButton').addEventListener('click', playAgain); // Ya está aquí
  document.getElementById('roleOverlay').addEventListener('click', hideRoleOverlay);
});