/* =====================================================================
   AVIATOR BACKGROUND MUSIC (Web Audio, no audio files)
   A procedural, cinematic casino-style loop that sits under the game
   SFX. It shares the AudioContext created by game.js and follows the
   mute toggle. Intensity is driven by the round phase (betting/flying).

   Layers (A minor, 96 BPM, 4-bar loop):
     - Detuned saw pad holding the chord each bar
     - Sub bass on beats 1 & 3
     - Plucky arpeggio cycling the chord tones
     - Soft bell melody (A minor pentatonic)
     - Gentle kick + filtered hat for a lounge pulse

   Public API:
     Music.init(ctx)            wire up buses (idempotent)
     Music.start()              begin the scheduler
     Music.stop()               stop the scheduler
     Music.setMuted(bool)       mute/unmute (also stops/resumes loop)
     Music.setIntensity(0..1)   brightness + level (game round phase)
   ===================================================================== */

(function () {
    'use strict';

    const BPM = 96;
    const STEP_DUR = 60 / BPM / 4;            // 16th note
    const LOOP_STEPS = 64;                     // 4 bars of 16
    const LOOP_DUR = LOOP_STEPS * STEP_DUR;    // ~10 s

    const CHORDS = [
        { root: 110.00, tones: [220.00, 261.63, 329.63] },   // Am
        { root: 87.31,  tones: [174.61, 220.00, 261.63] },   // F
        { root: 130.81, tones: [261.63, 329.63, 392.00] },   // C
        { root: 98.00,  tones: [196.00, 246.94, 293.66] }    // G
    ];

    const MELODY = [
        { step: 0,  f: 440.00, d: 0.8 },
        { step: 4,  f: 523.25, d: 0.8 },
        { step: 8,  f: 659.26, d: 1.5 },
        { step: 16, f: 587.33, d: 0.8 },
        { step: 20, f: 659.26, d: 1.5 },
        { step: 32, f: 523.25, d: 0.8 },
        { step: 36, f: 440.00, d: 0.8 },
        { step: 40, f: 392.00, d: 1.5 },
        { step: 48, f: 329.63, d: 0.8 },
        { step: 52, f: 440.00, d: 1.8 }
    ];

    const ARP_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
    const ARP_TONES = [0, 1, 2, 1];
    const HAT_STEPS = [2, 6, 10, 14];

    const Music = {
        _ctx: null,
        _master: null,
        _filter: null,
        _hatBuffer: null,
        _muted: false,
        _intensity: 0.5,
        _started: false,
        _timer: null,
        _step: 0,
        _nextStepTime: 0,

        /* ---------- setup ---------- */
        init(ctx) {
            if (!ctx || this._master) return;
            this._ctx = ctx;

            this._master = ctx.createGain();
            this._master.gain.value = this._muted ? 0 : 0.3;

            this._filter = ctx.createBiquadFilter();
            this._filter.type = 'lowpass';
            this._filter.frequency.value = 1200;
            this._filter.Q.value = 0.6;

            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -18;
            comp.ratio.value = 8;
            comp.attack.value = 0.003;
            comp.release.value = 0.25;

            this._master.connect(this._filter);
            this._filter.connect(comp);
            comp.connect(ctx.destination);

            this._hatBuffer = this._makeNoise(0.04);
        },

        _makeNoise(dur) {
            const ctx = this._ctx;
            const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
            }
            return buf;
        },

        _gainTarget() {
            return this._muted ? 0 : (0.22 + this._intensity * 0.2);
        },

        /* ---------- control ---------- */
        start() {
            if (!this._ctx || this._started) return;
            if (this._master) {
                this._master.gain.setTargetAtTime(this._gainTarget(), this._ctx.currentTime, 0.3);
            }
            if (this._ctx.state === 'suspended') this._ctx.resume();
            this._step = 0;
            this._nextStepTime = this._ctx.currentTime + 0.1;
            this._started = true;
            this._timer = setInterval(() => this._tick(), 90);
        },

        stop() {
            if (this._timer) clearInterval(this._timer);
            this._timer = null;
            this._started = false;
        },

        setMuted(m) {
            this._muted = !!m;
            if (m) {
                if (this._master && this._ctx) {
                    this._master.gain.setTargetAtTime(0, this._ctx.currentTime, 0.2);
                }
                this.stop();
            } else if (this._ctx) {
                this.start();
            }
        },

        setIntensity(x) {
            this._intensity = Math.max(0, Math.min(1, x));
            if (this._master && this._ctx && !this._muted) {
                this._master.gain.setTargetAtTime(this._gainTarget(), this._ctx.currentTime, 0.5);
            }
            if (this._filter && this._ctx) {
                this._filter.frequency.setTargetAtTime(900 + this._intensity * 1700, this._ctx.currentTime, 0.5);
            }
        },

        /* ---------- scheduler ---------- */
        _tick() {
            const ctx = this._ctx;
            if (!ctx || ctx.state !== 'running') return;

            // Fast-forward if we fell behind (tab throttle, suspended context)
            const behind = Math.floor((ctx.currentTime - this._nextStepTime) / STEP_DUR);
            if (behind > 0) {
                this._step = (this._step + behind) % LOOP_STEPS;
                this._nextStepTime += behind * STEP_DUR;
            }

            const ahead = 0.6;
            while (this._nextStepTime < ctx.currentTime + ahead) {
                this._scheduleStep(this._step, this._nextStepTime);
                this._nextStepTime += STEP_DUR;
                this._step = (this._step + 1) % LOOP_STEPS;
            }
        },

        _scheduleStep(step, time) {
            const bar = Math.floor(step / 16);
            const s = step % 16;
            const chord = CHORDS[bar % CHORDS.length];

            if (s === 0) this._pad(chord, time, LOOP_DUR);
            if (s === 0 || s === 8) {
                this._bass(chord.root, time);
                this._kick(time);
            }
            if (HAT_STEPS.indexOf(s) !== -1) this._hat(time);

            const arpIdx = ARP_STEPS.indexOf(s);
            if (arpIdx !== -1) {
                const tone = chord.tones[ARP_TONES[arpIdx % ARP_TONES.length] % chord.tones.length];
                this._pluck(tone * 2, time);
            }

            const mel = MELODY.find(m => m.step === step);
            if (mel) this._bell(mel.f, time, mel.d);
        },

        /* ---------- voices ---------- */
        _pad(chord, time, dur) {
            const ctx = this._ctx;
            chord.tones.forEach(f => {
                for (let i = 0; i < 2; i++) {
                    const o = ctx.createOscillator();
                    o.type = 'sawtooth';
                    o.frequency.value = f;
                    o.detune.value = i === 0 ? -6 : 6;

                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0, time);
                    g.gain.linearRampToValueAtTime(0.035, time + 0.9);
                    g.gain.setValueAtTime(0.035, time + dur - 1.2);
                    g.gain.linearRampToValueAtTime(0, time + dur);

                    o.connect(g);
                    g.connect(this._master);
                    o.start(time);
                    o.stop(time + dur + 0.05);
                }
            });
        },

        _bass(f, time) {
            const ctx = this._ctx;
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = f;

            const g = ctx.createGain();
            g.gain.setValueAtTime(0, time);
            g.gain.linearRampToValueAtTime(0.2, time + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, time + 1.1);

            o.connect(g);
            g.connect(this._master);
            o.start(time);
            o.stop(time + 1.2);
        },

        _pluck(f, time) {
            const ctx = this._ctx;
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = f;

            const g = ctx.createGain();
            g.gain.setValueAtTime(0, time);
            g.gain.linearRampToValueAtTime(0.055, time + 0.006);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.45);

            o.connect(g);
            g.connect(this._master);
            o.start(time);
            o.stop(time + 0.5);
        },

        _bell(f, time, dur) {
            const ctx = this._ctx;
            const o1 = ctx.createOscillator();
            o1.type = 'sine';
            o1.frequency.value = f;

            const o2 = ctx.createOscillator();
            o2.type = 'sine';
            o2.frequency.value = f * 2;
            o2.detune.value = 5;

            const g = ctx.createGain();
            g.gain.setValueAtTime(0, time);
            g.gain.linearRampToValueAtTime(0.07, time + 0.012);
            g.gain.exponentialRampToValueAtTime(0.001, time + dur);

            o1.connect(g);
            o2.connect(g);
            g.connect(this._master);
            o1.start(time);
            o2.start(time);
            o1.stop(time + dur + 0.05);
            o2.stop(time + dur + 0.05);
        },

        _kick(time) {
            const ctx = this._ctx;
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(120, time);
            o.frequency.exponentialRampToValueAtTime(42, time + 0.12);

            const g = ctx.createGain();
            g.gain.setValueAtTime(0.16, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

            o.connect(g);
            g.connect(this._master);
            o.start(time);
            o.stop(time + 0.2);
        },

        _hat(time) {
            if (!this._hatBuffer) return;
            const ctx = this._ctx;
            const src = ctx.createBufferSource();
            src.buffer = this._hatBuffer;

            const f = ctx.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = 6000;

            const g = ctx.createGain();
            g.gain.value = 0.018;

            src.connect(f);
            f.connect(g);
            g.connect(this._master);
            src.start(time);
        }
    };

    window.Music = Music;
})();
