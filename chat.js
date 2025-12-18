// chat.js
document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // CONFIGURATION
    // ============================================

    const CONFIG = {
        TYPING_TIMEOUT: 2000,
        MILESTONE_MESSAGES: [10, 25, 50, 100],
        PARTICLE_COUNT: 30,
        CONFETTI_COUNT: 100,
        SOUND_VOLUME: 0.25,
       SOCKET_URL: 'https://anonytalk-backend-1.onrender.com',
        DEFAULT_ROOM: 'general'
    };

    // ============================================
    // STATE
    // ============================================
    let state = {
        username: localStorage.getItem('anonytalk_username') || `User${Math.floor(Math.random() * 10000)}`,
        userColor: localStorage.getItem('anonytalk_color') || getRandomColor(),
        messageCount: 0,
        onlineCount: 1,
        typingTimeout: null,
        isTyping: false,
        soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
        theme: localStorage.getItem('theme') || 'light',
        currentRoom: CONFIG.DEFAULT_ROOM
    };

    localStorage.setItem('anonytalk_username', state.username);
    localStorage.setItem('anonytalk_color', state.userColor);

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const elements = {
        chatBody: document.getElementById('chatBody'),
        messageForm: document.getElementById('messageForm'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        typingSection: document.getElementById('typingSection'),
        typingUsername: document.getElementById('typingUsername'),
        userCount: document.getElementById('userCount'),
        messageCount: document.getElementById('messageCount'),
        themeToggle: document.getElementById('themeToggle'),
        soundToggle: document.getElementById('soundToggle'),
        welcomeBanner: document.getElementById('welcomeBanner'),
        charCounter: document.getElementById('charCounter'),
        emojiPickerBtn: document.getElementById('emojiPickerBtn'),
        emojiPanel: document.getElementById('emojiPanel'),
        particlesContainer: document.getElementById('particlesContainer'),
        confettiCanvas: document.getElementById('confettiCanvas')
    };

    // ============================================
    // AUDIO SETUP
    // ============================================
    const sounds = {
        send: createSound('send'),
        receive: createSound('receive'),
        milestone: createSound('milestone')
    };

    function createSound(type) {
        const audio = new Audio();
        audio.volume = CONFIG.SOUND_VOLUME;

        const soundData = {
            send: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=', // silent placeholder
            receive: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=',
            milestone: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='
        };

        audio.src = soundData[type];
        return audio;
    }

    function playSound(type) {
        if (state.soundEnabled && sounds[type]) {
            sounds[type].currentTime = 0;
            sounds[type].play().catch(() => {});
        }
    }

    // ============================================
    // THEME MANAGEMENT
    // ============================================
    document.documentElement.setAttribute('data-theme', state.theme);

    elements.themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', state.theme);
        localStorage.setItem('theme', state.theme);
    });

    elements.soundToggle.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        localStorage.setItem('sound_enabled', state.soundEnabled);
        elements.soundToggle.classList.toggle('sound-off');
    });

    // ============================================
    // PARTICLES BACKGROUND
    // ============================================
    function createParticles() {
        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            const startX = Math.random() * 100;
            const startY = Math.random() * 100;
            const endX = (Math.random() - 0.5) * 200;
            const endY = (Math.random() - 0.5) * 200;
            const delay = Math.random() * 20;

            particle.style.left = `${startX}%`;
            particle.style.top = `${startY}%`;
            particle.style.setProperty('--tx', `${endX}px`);
            particle.style.setProperty('--ty', `${endY}px`);
            particle.style.animationDelay = `${delay}s`;

            elements.particlesContainer.appendChild(particle);
        }
    }
    createParticles();

    // ============================================
    // EMOJI PICKER
    // ============================================
    elements.emojiPickerBtn.addEventListener('click', e => {
        e.stopPropagation();
        elements.emojiPanel.classList.toggle('active');
    });

    document.addEventListener('click', e => {
        if (!elements.emojiPanel.contains(e.target) && e.target !== elements.emojiPickerBtn) {
            elements.emojiPanel.classList.remove('active');
        }
    });

    document.querySelectorAll('.emoji-item').forEach(emoji => {
        emoji.addEventListener('click', () => {
            elements.messageInput.value += emoji.textContent;
            elements.messageInput.focus();
            updateCharCounter();
        });
    });

    // ============================================
    // SOCKET.IO CONNECTION
    // ============================================
    const socket = io(CONFIG.SOCKET_URL);

    // Join default room on connect
    socket.emit('join-room', state.currentRoom);

    // Render chat history on joining
    socket.on('chat-history', (messages) => {
        elements.chatBody.innerHTML = '';
        messages.forEach(msg => {
            addMessage({
                username: msg.username,
                message: msg.message,
                timestamp: msg.timestamp,
                color: msg.color,
                isSent: msg.username === state.username
            });
        });
    });

    // Online user count per room
    socket.on('user-count', count => {
        state.onlineCount = count;
        updateOnlineCount();
    });

    socket.on('message', data => {
        const isSentByMe = data.username === state.username;

        addMessage({
            username: data.username,
            message: data.message,
            timestamp: data.timestamp,
            color: data.color,
            isSent: isSentByMe
        });

        if (!isSentByMe) playSound('receive');
        state.messageCount++;
        updateMessageCount();
        checkMilestone();
    });

    socket.on('user-typing', data => {
        if (data.username !== state.username) showTypingIndicator(data.username);
    });

    socket.on('user-stop-typing', data => {
        if (data.username !== state.username) hideTypingIndicator();
    });

    socket.on('disconnect', () => console.log('Disconnected from server'));

    // ============================================
    // MESSAGE HANDLING
    // ============================================
    elements.messageForm.addEventListener('submit', e => {
        e.preventDefault();
        const messageText = elements.messageInput.value.trim();
        if (!messageText) return;

        const timestamp = formatTime(new Date());

        socket.emit('send-message', {
            room: state.currentRoom,
            username: state.username,
            message: messageText,
            timestamp: timestamp,
            color: state.userColor
        });

        elements.messageInput.value = '';
        updateCharCounter();
        stopTyping();
        playSound('send');
    });

    elements.messageInput.addEventListener('input', () => {
        updateCharCounter();

        if (elements.messageInput.value.trim() && !state.isTyping) {
            state.isTyping = true;
            socket.emit('typing', {
                room: state.currentRoom,
                username: state.username
            });
        }

        clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(stopTyping, CONFIG.TYPING_TIMEOUT);
    });

    function stopTyping() {
        if (state.isTyping) {
            state.isTyping = false;
            socket.emit('stop-typing', {
                room: state.currentRoom,
                username: state.username
            });
        }
    }

    function showTypingIndicator(username) {
        elements.typingUsername.textContent = `${username} is typing...`;
        elements.typingSection.classList.add('active');
    }

    function hideTypingIndicator() {
        elements.typingSection.classList.remove('active');
    }

    // ============================================
    // HELPER FUNCTIONS (render message, scroll, counters, etc.)
    // ============================================
    function addMessage(data) {
        removeWelcomeBanner();

        const messageWrapper = document.createElement('div');
        messageWrapper.className = `message-wrapper ${data.isSent ? 'sent' : 'received'}`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.style.background = data.color;
        avatar.textContent = data.username.charAt(0).toUpperCase();

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';

        const username = document.createElement('span');
        username.className = 'message-username';
        username.textContent = data.username;

        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = data.timestamp;

        messageHeader.appendChild(username);
        messageHeader.appendChild(time);

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.textContent = data.message;

        const reactions = document.createElement('div');
        reactions.className = 'message-reactions';

        ['❤️', '👍', '😊'].forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'reaction-btn';
            btn.textContent = emoji;
            btn.addEventListener('click', () => btn.classList.toggle('active'));
            reactions.appendChild(btn);
        });

        messageContent.appendChild(messageHeader);
        messageContent.appendChild(messageBubble);
        messageContent.appendChild(reactions);

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageContent);

        elements.chatBody.appendChild(messageWrapper);
        scrollToBottom();
    }

    function removeWelcomeBanner() {
        if (elements.welcomeBanner) {
            elements.welcomeBanner.style.animation = 'fadeOut 0.5s ease';
            setTimeout(() => {
                if (elements.welcomeBanner?.parentNode) elements.welcomeBanner.remove();
            }, 500);
        }
    }

    function scrollToBottom() {
        setTimeout(() => {
            elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
        }, 100);
    }

    function updateCharCounter() {
        const length = elements.messageInput.value.length;
        elements.charCounter.textContent = `${length}/500`;
        elements.charCounter.style.color = length > 450 ? '#f56565' : 'var(--text-muted)';
    }

    function updateMessageCount() { elements.messageCount.textContent = state.messageCount; }
    function updateOnlineCount() { elements.userCount.textContent = state.onlineCount; }

    function formatTime(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    function getRandomColor() {
        const colors = [
            'linear-gradient(135deg, #f56565 0%, #c53030 100%)',
            'linear-gradient(135deg, #ed8936 0%, #c05621 100%)',
            'linear-gradient(135deg, #ecc94b 0%, #b7791f 100%)',
            'linear-gradient(135deg, #48bb78 0%, #2f855a 100%)',
            'linear-gradient(135deg, #38b2ac 0%, #2c7a7b 100%)',
            'linear-gradient(135deg, #4299e1 0%, #2b6cb0 100%)',
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #9f7aea 0%, #6b46c1 100%)'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // ============================================
    // MILESTONE & CONFETTI
    // ============================================
    function checkMilestone() {
        if (CONFIG.MILESTONE_MESSAGES.includes(state.messageCount)) {
            showMilestoneNotification(state.messageCount);
            triggerConfetti();
            playSound('milestone');
        }
    }

    function showMilestoneNotification(count) {
        const notification = document.createElement('div');
        notification.className = 'milestone-notification';
        notification.textContent = `🎉 ${count} Messages! 🎉`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    function triggerConfetti() {
        const canvas = elements.confettiCanvas;
        const ctx = canvas.getContext('2d');

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const confetti = [];
        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];

        for (let i = 0; i < CONFIG.CONFETTI_COUNT; i++) {
            confetti.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                rotation: Math.random() * 360,
                size: Math.random() * 10 + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                velocity: { x: (Math.random() - 0.5) * 2, y: Math.random() * 3 + 2 },
                rotationSpeed: (Math.random() - 0.5) * 10
            });
        }

        function animateConfetti() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            confetti.forEach((piece, index) => {
                ctx.save();
                ctx.translate(piece.x, piece.y);
                ctx.rotate((piece.rotation * Math.PI) / 180);
                ctx.fillStyle = piece.color;
                ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size);
                ctx.restore();

                piece.x += piece.velocity.x;
                piece.y += piece.velocity.y;
                piece.rotation += piece.rotationSpeed;

                if (piece.y > canvas.height) confetti.splice(index, 1);
            });

            if (confetti.length > 0) requestAnimationFrame(animateConfetti);
        }

        animateConfetti();
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    updateOnlineCount();
    updateMessageCount();
    elements.messageInput.focus();

    console.log('Anony Talk initialized!');
    console.log('Username:', state.username);
    console.log('Color:', state.userColor);
    console.log('Connecting to:', CONFIG.SOCKET_URL);

});
