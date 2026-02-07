
// ===== WAKE WORD SETTINGS =====
const WAKE_WORD = "hey pudie";
let wakeWordEnabled = true;

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = 'Sorry, your browser does not support speech recognition. Please use Chrome, Edge, or Safari.';
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;

        const micButton = document.getElementById('micButton');
        const status = document.getElementById('status');
        const transcript = document.getElementById('transcript');
        const timersList = document.getElementById('timersList');
        const alarmsList = document.getElementById('alarmsList');
        let isListening = false;
        
        let activeAlarms = [];
        let activeTimers = [];
        let alarmCheckInterval = null;
        let timerUpdateInterval = null;
        let alarmAudio = null;

        // Vibration function
        function vibrateDevice() {
            if ('vibrate' in navigator) {
                // Vibrate pattern: [vibrate, pause, vibrate, pause, ...]
                // This creates a repeating alarm-like vibration
                navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
            }
        }

        // Alarm sound function
        function playAlarmSound() {
            // Stop any existing alarm sound
            if (alarmAudio) {
                alarmAudio.pause();
                alarmAudio.currentTime = 0;
            }

            // Create audio context for alarm sound
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Create alarm-like beeping sound
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // High pitch beep

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            
            // Create beeping pattern
            let time = audioContext.currentTime;
            for (let i = 0; i < 5; i++) {
                gainNode.gain.setValueAtTime(0.3, time);
                gainNode.gain.setValueAtTime(0, time + 0.2);
                time += 0.4;
            }

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 2);

            // Store reference
            alarmAudio = oscillator;
        }

        function updateTimersDisplay() {
            if (activeTimers.length === 0) {
                timersList.innerHTML = '<p style="color: #88ffbb; font-size: 12px; margin: 5px 0;">No active timers</p>';
            } else {
                timersList.innerHTML = activeTimers.map(timer => {
                    const remaining = Math.max(0, Math.floor((timer.endTime - Date.now()) / 1000));
                    const minutes = Math.floor(remaining / 60);
                    const seconds = remaining % 60;
                    return `
                        <div class="timer-item">
                            <span>${timer.message}</span>
                            <div>
                                <span class="timer-countdown">${minutes}:${seconds.toString().padStart(2, '0')}</span>
                                <button class="delete-btn" onclick="cancelTimer(${timer.id})">✕</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        function updateAlarmsDisplay() {
            if (activeAlarms.length === 0) {
                alarmsList.innerHTML = '<p style="color: #88ffbb; font-size: 12px; margin: 5px 0;">No active alarms</p>';
            } else {
                alarmsList.innerHTML = activeAlarms.map(alarm => {
                    const timeString = `${alarm.hour % 12 || 12}:${alarm.minute.toString().padStart(2, '0')} ${alarm.hour >= 12 ? 'PM' : 'AM'}`;
                    return `
                        <div class="alarm-item">
                            <span>Alarm: ${timeString}</span>
                            <button class="delete-btn" onclick="cancelAlarm(${alarm.id})">✕</button>
                        </div>
                    `;
                }).join('');
            }
        }

        function startTimer(seconds, message = "Timer finished") {
            const timerId = Date.now();
            const endTime = Date.now() + (seconds * 1000);
            
            const timer = {
                id: timerId,
                endTime: endTime,
                message: message,
                seconds: seconds,
                timeout: setTimeout(() => {
                    timerAlert(message);
                    removeTimer(timerId);
                }, seconds * 1000)
            };
            
            activeTimers.push(timer);
            updateTimersDisplay();
            
            if (!timerUpdateInterval) {
                timerUpdateInterval = setInterval(updateTimersDisplay, 1000);
            }
            
            return timerId;
        }

        function timerAlert(message) {
            speak(`Timer alert! ${message}`);
            playAlarmSound();
            vibrateDevice();
            
            const alertDiv = document.createElement('div');
            alertDiv.id = 'currentAlert';
            alertDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 0, 85, 0.95);
                color: white;
                padding: 30px;
                border-radius: 15px;
                font-size: 24px;
                font-weight: bold;
                z-index: 10000;
                box-shadow: 0 0 50px rgba(255, 0, 85, 0.8);
                animation: pulse 1s infinite;
                text-align: center;
            `;
            alertDiv.innerHTML = `
                ⏰ ${message}
                <button class="stop-alert-btn" onclick="dismissAlert()">STOP</button>
            `;
            document.body.appendChild(alertDiv);
        }

        function removeTimer(timerId) {
            const timer = activeTimers.find(t => t.id === timerId);
            if (timer && timer.timeout) {
                clearTimeout(timer.timeout);
            }
            activeTimers = activeTimers.filter(t => t.id !== timerId);
            updateTimersDisplay();
            
            if (activeTimers.length === 0 && timerUpdateInterval) {
                clearInterval(timerUpdateInterval);
                timerUpdateInterval = null;
            }
        }

        function cancelTimer(timerId) {
            removeTimer(timerId);
            speak("Timer cancelled");
        }

        function setAlarm(hour, minute, message = "Alarm", repeat = false, days = []) {
            const alarmId = Date.now();
            
            const alarm = {
                id: alarmId,
                hour: hour,
                minute: minute,
                message: message,
                repeat: repeat,
                days: days,
                enabled: true
            };
            
            activeAlarms.push(alarm);
            updateAlarmsDisplay();
            
            if (!alarmCheckInterval) {
                alarmCheckInterval = setInterval(checkAlarms, 1000);
            }
            
            return alarmId;
        }

        function checkAlarms() {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentSecond = now.getSeconds();
            const currentDay = now.getDay();
            
            activeAlarms.forEach(alarm => {
                if (!alarm.enabled) return;
                
                if (alarm.hour === currentHour && alarm.minute === currentMinute && currentSecond === 0) {
                    if (alarm.repeat && alarm.days.length > 0) {
                        if (alarm.days.includes(currentDay)) {
                            alarmAlert(alarm.message);
                        }
                    } else if (!alarm.repeat) {
                        alarmAlert(alarm.message);
                        removeAlarm(alarm.id);
                    } else {
                        alarmAlert(alarm.message);
                    }
                }
            });
        }

        function alarmAlert(message) {
            speak(`Alarm! ${message}`);
            playAlarmSound();
            vibrateDevice();
            
            const alertDiv = document.createElement('div');
            alertDiv.id = 'currentAlert';
            alertDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255, 200, 0, 0.95);
                color: #0a1f0f;
                padding: 30px;
                border-radius: 15px;
                font-size: 24px;
                font-weight: bold;
                z-index: 10000;
                box-shadow: 0 0 50px rgba(255, 200, 0, 0.8);
                animation: pulse 1s infinite;
                text-align: center;
            `;
            alertDiv.innerHTML = `
                ⏰ ${message}
                <button class="stop-alert-btn" onclick="dismissAlert()">STOP</button>
            `;
            document.body.appendChild(alertDiv);
        }

        function removeAlarm(alarmId) {
            activeAlarms = activeAlarms.filter(a => a.id !== alarmId);
            updateAlarmsDisplay();
            
            if (activeAlarms.length === 0 && alarmCheckInterval) {
                clearInterval(alarmCheckInterval);
                alarmCheckInterval = null;
            }
        }

        function cancelAlarm(alarmId) {
            removeAlarm(alarmId);
            speak("Alarm cancelled");
        }

        function dismissAlert() {
            const alertDiv = document.getElementById('currentAlert');
            if (alertDiv) {
                alertDiv.remove();
            }
            
            // Stop speech
            speechSynthesis.cancel();
            
            // Stop vibration
            if ('vibrate' in navigator) {
                navigator.vibrate(0);
            }
            
            // Stop alarm sound
            if (alarmAudio) {
                try {
                    alarmAudio.stop();
                } catch(e) {
                    // Already stopped
                }
                alarmAudio = null;
            }
        }

        micButton.addEventListener('click', () => {
            if (isListening) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });

        recognition.onstart = () => {
            isListening = true;
            micButton.classList.add('listening');
            status.classList.add('listening');
            status.textContent = '🎤 Listening... Speak now!';
        };

        recognition.onend = () => {
            isListening = false;
            micButton.classList.remove('listening');
            status.classList.remove('listening', 'speaking');
            status.textContent = 'Ready to listen...';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            status.textContent = 'Error: ' + event.error;
            isListening = false;
            micButton.classList.remove('listening');
        };

        recognition.onresult = (event) => {
    let command = event.results[0][0].transcript.toLowerCase();

    // 🔒 Wake word check
    if (wakeWordEnabled) {
        if (!command.includes(WAKE_WORD)) {
            return; // ignore kapag walang "hey pudie"
        }

        // tanggalin ang wake word
        command = command.replace(WAKE_WORD, "").trim();

        // kung "hey pudie" lang
        if (command.length === 0) {
            speak("Yes?");
            return;
        }
    }

    addToTranscript('You', command);
    processCommand(command);
};

        function addToTranscript(speaker, text) {
            const p = document.createElement('p');
            const className = speaker === 'You' ? 'user-text' : 'assistant-text';
            p.innerHTML = `<span class="${className}">${speaker}:</span> ${text}`;
            
            if (transcript.children.length === 1 && transcript.children[0].style.textAlign === 'center') {
                transcript.innerHTML = '';
            }
            
            transcript.appendChild(p);
            transcript.scrollTop = transcript.scrollHeight;
        }

        function speak(text) {
            status.classList.add('speaking');
            status.textContent = '🔊 Speaking...';
            addToTranscript('Pudie', text);

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 0.9;
            utterance.pitch = 1;
            utterance.volume = 1;

            utterance.onend = () => {
                status.classList.remove('speaking');
                status.textContent = 'Ready to listen...';
            };

            speechSynthesis.speak(utterance);
        }

        function processCommand(command) {
            const cmd = command.toLowerCase();
            
            if (cmd.includes('timer') || cmd.includes('set a timer')) {
                let seconds = 0;
                let message = "Timer";
                
                const minuteMatch = cmd.match(/(\d+)\s*minute/i);
                if (minuteMatch) {
                    seconds += parseInt(minuteMatch[1]) * 60;
                    message = `${minuteMatch[1]} minute timer`;
                }
                
                const secondMatch = cmd.match(/(\d+)\s*second/i);
                if (secondMatch) {
                    seconds += parseInt(secondMatch[1]);
                    if (!minuteMatch) {
                        message = `${secondMatch[1]} second timer`;
                    }
                }
                
                const hourMatch = cmd.match(/(\d+)\s*hour/i);
                if (hourMatch) {
                    seconds += parseInt(hourMatch[1]) * 3600;
                    message = `${hourMatch[1]} hour timer`;
                }
                
                if (seconds > 0) {
                    startTimer(seconds, message);
                    speak(`Timer set for ${message}`);
                } else {
                    speak("Please Freshmeat specify the timer duration. For example, say set timer for 5 minutes");
                }
                return;
            }

            if (cmd.includes('alarm') || cmd.includes('wake me')) {
                let hour = 0;
                let minute = 0;
                let isPM = false;
                
                if (cmd.includes('pm') || cmd.includes('p.m')) {
                    isPM = true;
                }
                
                const timeMatch = cmd.match(/(\d+)[\s:]?(\d{2})?/);
                if (timeMatch) {
                    hour = parseInt(timeMatch[1]);
                    minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                    
                    if (isPM && hour !== 12) {
                        hour += 12;
                    } else if (!isPM && hour === 12) {
                        hour = 0;
                    }
                    
                    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
                        const timeString = `${hour % 12 || 12}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
                        setAlarm(hour, minute, `Alarm at ${timeString}`);
                        speak(`Freshmeat your alarm set for ${timeString}`);
                    } else {
                        speak("Invalid time. Please try again.");
                    }
                } else {
                    speak("Please Freshmeat specify the alarm time. For example, say set alarm for 7 AM");
                }
                return;
            }

            if (cmd.includes('show alarm') || cmd.includes('list alarm')) {
                if (activeAlarms.length === 0) {
                    speak("You have no active alarms");
                } else {
                    const alarmList = activeAlarms.map(a => {
                        const timeString = `${a.hour % 12 || 12}:${a.minute.toString().padStart(2, '0')} ${a.hour >= 12 ? 'PM' : 'AM'}`;
                        return timeString;
                    }).join(', ');
                    speak(`You have ${activeAlarms.length} alarm${activeAlarms.length > 1 ? 's' : ''} set: ${alarmList}`);
                }
                return;
            }

            if (cmd.includes('show timer') || cmd.includes('list timer')) {
                if (activeTimers.length === 0) {
                    speak("You have no active timers");
                } else {
                    speak(`You have ${activeTimers.length} active timer${activeTimers.length > 1 ? 's' : ''}`);
                }
                return;
            }

            if (cmd.includes('cancel') && (cmd.includes('alarm') || cmd.includes('all alarm'))) {
                if (activeAlarms.length === 0) {
                    speak("No alarms to cancel");
                } else {
                    activeAlarms = [];
                    if (alarmCheckInterval) {
                        clearInterval(alarmCheckInterval);
                        alarmCheckInterval = null;
                    }
                    updateAlarmsDisplay();
                    speak("All Freshmeat alarms have been cancelled");
                }
                return;
            }

            if (cmd.includes('cancel') && (cmd.includes('timer') || cmd.includes('all timer'))) {
                if (activeTimers.length === 0) {
                    speak("No timers to cancel");
                } else {
                    activeTimers.forEach(timer => {
                        if (timer.timeout) clearTimeout(timer.timeout);
                    });
                    activeTimers = [];
                    if (timerUpdateInterval) {
                        clearInterval(timerUpdateInterval);
                        timerUpdateInterval = null;
                    }
                    updateTimersDisplay();
                    speak("All timers have been cancelled");
                }
                return;
            }

            if (cmd.includes('stop') || cmd.includes('exit') || cmd.includes('quit') || cmd.includes('bye')) {
                speak('Goodbye Freshmeat! Have a great day!');
                return;
            }

            if (cmd.includes('time')) {
                const now = new Date();
                const timeString = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                speak(`The current time is ${timeString}`);
                return;
            }

            if (cmd.includes('date') || cmd.includes('today')) {
                const now = new Date();
                const dateString = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                speak(`Today's date is ${dateString}`);
                return;
            }

            if (cmd.match(/\d+/) && (cmd.includes('+') || cmd.includes('-') || cmd.includes('*') || cmd.includes('/') || 
                cmd.includes('x') || cmd.includes('plus') || cmd.includes('minus') || cmd.includes('times') || 
                cmd.includes('multiply') || cmd.includes('divide') || cmd.includes('calculate') || cmd.includes('compute'))) {
                
                try {
                    let expression = cmd;
                    expression = expression.replace(/what is|calculate|compute|can you|please|equals?/gi, '');
                    expression = expression.replace(/plus|add/gi, '+');
                    expression = expression.replace(/minus|subtract/gi, '-');
                    expression = expression.replace(/times|multiply|multiplied by/gi, '*');
                    expression = expression.replace(/divided by|divide|over/gi, '/');
                    expression = expression.replace(/\s+x\s+/gi, '*');
                    expression = expression.trim();
                    
                    const result = eval(expression);
                    speak(`The answer is ${result}`);
                } catch (e) {
                    speak("Sorry, I couldn't calculate that.");
                }
                return;
            }

            if (cmd.includes('joke') || cmd.includes('funny')) {
                const jokes = [
                    "Why do programmers prefer dark mode? Because light attracts bugs!",
                    "Why did the developer go broke? Because he used up all his cache!",
                    "What do you call a programmer from Finland? Nerdic!",
                    "Why do Java developers wear glasses? Because they don't C sharp!",
                    "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
                    "Why did the computer show up at work late? It had a hard drive!",
                    "What's a computer's favorite snack? Microchips!",
                    "Why was the JavaScript developer sad? Because he didn't Node how to Express himself!"
                ];
                const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
                speak(randomJoke);
                return;
            }

            if (cmd.includes('open')) {
                const websites = {
                    'youtube': 'https://www.youtube.com',
                    'google': 'https://www.google.com',
                    'facebook': 'https://www.facebook.com',
                    'instagram': 'https://www.instagram.com',
                    'twitter': 'https://www.twitter.com',
                    'gmail': 'https://mail.google.com',
                    'messenger': 'https://messenger.com'
                };

                for (const [site, url] of Object.entries(websites)) {
                    if (cmd.includes(site)) {
                        speak(`Opening ${site}`);
                        window.open(url, '_blank');
                        return;
                    }
                }
                speak("Sorry Freshmeat, I don't know how to open that website.");
                return;
            }

            speak(`You said: ${command}`);
        }

        function clearTranscript() {
            transcript.innerHTML = '<p style="text-align: center; color: #88ffbb;">Your conversation will appear here...</p>';
        }

        updateTimersDisplay();
        updateAlarmsDisplay();