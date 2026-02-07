
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

        // ===== TEXT-TO-SPEECH FUNCTION =====
        function speak(text) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.lang = 'en-US';
            
            // Get available voices and select a good one
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(voice => 
                voice.name.includes('Female') || 
                voice.name.includes('Samantha') ||
                voice.name.includes('Google')
            );
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
            
            window.speechSynthesis.speak(utterance);
        }

        // Load voices when they're ready
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }

        // Global variables for continuous alarm
        let alarmAudioContext = null;
        let alarmOscillator = null;
        let alarmGainNode = null;
        let alarmInterval = null;
        let vibrationInterval = null;

        // Vibration function - CONTINUOUS
        function startContinuousVibration() {
            // Stop any existing vibration
            stopContinuousVibration();
            
            if ('vibrate' in navigator) {
                // Vibrate every 1 second continuously
                vibrationInterval = setInterval(() => {
                    navigator.vibrate([500, 200, 500]); // vibrate pattern
                }, 1200);
            }
        }

        function stopContinuousVibration() {
            if (vibrationInterval) {
                clearInterval(vibrationInterval);
                vibrationInterval = null;
            }
            if ('vibrate' in navigator) {
                navigator.vibrate(0); // Stop any ongoing vibration
            }
        }

        // Alarm sound function - CONTINUOUS LOOP
        function playAlarmSound() {
            // Stop any existing alarm
            stopAlarmSound();

            // Create audio context for alarm sound
            alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            function createBeep() {
                alarmOscillator = alarmAudioContext.createOscillator();
                alarmGainNode = alarmAudioContext.createGain();

                alarmOscillator.connect(alarmGainNode);
                alarmGainNode.connect(alarmAudioContext.destination);

                // Create alarm-like beeping sound
                alarmOscillator.type = 'sine';
                alarmOscillator.frequency.setValueAtTime(800, alarmAudioContext.currentTime); // High pitch beep

                // Create beeping pattern (on-off-on-off)
                const now = alarmAudioContext.currentTime;
                alarmGainNode.gain.setValueAtTime(0, now);
                alarmGainNode.gain.setValueAtTime(0.3, now + 0.05);
                alarmGainNode.gain.setValueAtTime(0.3, now + 0.2);
                alarmGainNode.gain.setValueAtTime(0, now + 0.25);
                alarmGainNode.gain.setValueAtTime(0.3, now + 0.4);
                alarmGainNode.gain.setValueAtTime(0.3, now + 0.6);
                alarmGainNode.gain.setValueAtTime(0, now + 0.65);

                alarmOscillator.start(now);
                alarmOscillator.stop(now + 1);
            }

            // Start first beep
            createBeep();
            
            // Loop beep every 1 second
            alarmInterval = setInterval(() => {
                createBeep();
            }, 1000);
        }

        function stopAlarmSound() {
            // Stop interval
            if (alarmInterval) {
                clearInterval(alarmInterval);
                alarmInterval = null;
            }
            
            // Stop oscillator
            if (alarmOscillator) {
                try {
                    alarmOscillator.stop();
                } catch (e) {
                    // Already stopped
                }
                alarmOscillator = null;
            }
            
            // Close audio context
            if (alarmAudioContext) {
                try {
                    alarmAudioContext.close();
                } catch (e) {
                    // Already closed
                }
                alarmAudioContext = null;
            }
            
            alarmGainNode = null;
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
            playAlarmSound(); // Continuous beeping
            startContinuousVibration(); // Continuous vibration
            
            // Transform mic button into STOP button with ringing animation
            micButton.classList.add('ringing');
            micButton.classList.remove('listening');
            micButton.textContent = 'STOP';
            micButton.style.fontSize = '24px';
            micButton.style.fontWeight = 'bold';
            
            // Update status with alarm class
            status.classList.add('alarm');
            status.textContent = `⏰ ${message}`;
            status.style.color = '#ff0055';
            status.style.fontSize = '18px';
            status.style.fontWeight = 'bold';
            
            // Store that we're in alarm mode
            micButton.dataset.alarmMode = 'timer';
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
                days: days
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
            const currentDay = now.getDay();
            
            activeAlarms.forEach(alarm => {
                if (alarm.hour === currentHour && alarm.minute === currentMinute && !alarm.triggered) {
                    if (!alarm.repeat || alarm.days.includes(currentDay)) {
                        alarmAlert(alarm.message);
                        alarm.triggered = true;
                        
                        if (!alarm.repeat) {
                            setTimeout(() => removeAlarm(alarm.id), 60000);
                        } else {
                            setTimeout(() => alarm.triggered = false, 60000);
                        }
                    }
                }
            });
        }

        function alarmAlert(message) {
            speak(`Alarm! ${message}`);
            playAlarmSound(); // Continuous beeping
            startContinuousVibration(); // Continuous vibration
            
            // Transform mic button into STOP button with ringing animation
            micButton.classList.add('ringing');
            micButton.classList.remove('listening');
            micButton.textContent = 'STOP';
            micButton.style.fontSize = '24px';
            micButton.style.fontWeight = 'bold';
            
            // Update status with alarm class
            status.classList.add('alarm');
            status.textContent = `⏰ ${message}`;
            status.style.color = '#ff0055';
            status.style.fontSize = '18px';
            status.style.fontWeight = 'bold';
            
            // Store that we're in alarm mode
            micButton.dataset.alarmMode = 'alarm';
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
            // Remove the alert popup (if any old code created it)
            const alertDiv = document.getElementById('currentAlert');
            if (alertDiv) {
                alertDiv.remove();
            }
            
            // Stop the continuous alarm sound
            stopAlarmSound();
            
            // Stop continuous vibration
            stopContinuousVibration();
            
            // Stop all speech synthesis
            window.speechSynthesis.cancel();
            
            // Restore mic button to normal state
            micButton.classList.remove('ringing', 'alarm-active');
            micButton.textContent = '🎤';
            micButton.style.fontSize = '50px';
            micButton.style.fontWeight = 'normal';
            micButton.style.animation = '';
            
            // Restore status to normal
            status.classList.remove('alarm');
            status.textContent = 'Ready to listen...';
            status.style.color = '#88ffbb';
            status.style.fontSize = '';
            status.style.fontWeight = '';
            delete micButton.dataset.alarmMode;
        }

        // ===== SPEECH RECOGNITION HANDLERS =====
        recognition.onstart = () => {
            isListening = true;
            micButton.classList.add('listening');
            status.textContent = 'Listening...';
            status.style.color = '#ff0055';
        };

        recognition.onend = () => {
            isListening = false;
            micButton.classList.remove('listening');
            status.textContent = 'Ready to listen...';
            status.style.color = '#88ffbb';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            status.textContent = `Error: ${event.error}`;
            status.style.color = '#ff0055';
            isListening = false;
            micButton.classList.remove('listening');
        };

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript.toLowerCase();
            console.log('Heard:', speechResult);
            
            // Add to transcript
            const userDiv = document.createElement('div');
            userDiv.className = 'message user-message';
            userDiv.innerHTML = `<strong>You:</strong> ${speechResult}`;
            
            if (transcript.innerHTML.includes('Your conversation will appear here')) {
                transcript.innerHTML = '';
            }
            transcript.appendChild(userDiv);
            
            // Process command
            processCommand(speechResult);
        };

        // ===== MICROPHONE BUTTON =====
        micButton.addEventListener('click', () => {
            // Check if we're in alarm mode
            if (micButton.dataset.alarmMode) {
                dismissAlert();
                return;
            }
            
            // Normal mic behavior
            if (isListening) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (error) {
                    console.error('Recognition start error:', error);
                }
            }
        });

        function addResponse(text) {
            const responseDiv = document.createElement('div');
            responseDiv.className = 'message assistant-message';
            responseDiv.innerHTML = `<strong>Pudie:</strong> ${text}`;
            transcript.appendChild(responseDiv);
            transcript.scrollTop = transcript.scrollHeight;
        }

        function processCommand(command) {
            const cmd = command.toLowerCase();

            if (cmd.includes('timer')) {
                let seconds = 0;
                let message = "Timer finished";
                
                const minuteMatch = cmd.match(/(\d+)\s*(?:minute|min)/);
                const secondMatch = cmd.match(/(\d+)\s*(?:second|sec)/);
                const hourMatch = cmd.match(/(\d+)\s*(?:hour|hr)/);
                
                if (minuteMatch) {
                    seconds += parseInt(minuteMatch[1]) * 60;
                    message = `${minuteMatch[1]} minute timer`;
                }
                if (secondMatch) {
                    seconds += parseInt(secondMatch[1]);
                    message = `${secondMatch[1]} second timer`;
                }
                if (hourMatch) {
                    seconds += parseInt(hourMatch[1]) * 3600;
                    message = `${hourMatch[1]} hour timer`;
                }
                
                if (seconds > 0) {
                    startTimer(seconds, message);
                    speak(`Timer set for ${message}`);
                    addResponse(`Timer set for ${message}`);
                } else {
                    speak("Please specify the timer duration. For example, say set timer for 5 minutes");
                    addResponse("Please specify the timer duration. For example, say set timer for 5 minutes");
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
                        speak(`Alarm set for ${timeString}`);
                        addResponse(`Alarm set for ${timeString}`);
                    } else {
                        speak("Invalid time. Please try again.");
                        addResponse("Invalid time. Please try again.");
                    }
                } else {
                    speak("Please specify the alarm time. For example, say set alarm for 7 AM");
                    addResponse("Please specify the alarm time. For example, say set alarm for 7 AM");
                }
                return;
            }

            if (cmd.includes('show alarm') || cmd.includes('list alarm')) {
                if (activeAlarms.length === 0) {
            
