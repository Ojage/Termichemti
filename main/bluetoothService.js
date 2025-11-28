const { EventEmitter } = require('events');
const crypto = require('crypto');
const { setTimeout: delay } = require('timers/promises');

const DEFAULT_TIMEOUT_MS = 15000;

function validatePayloadSchema(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Payload must be an object');
    }

    const { ssid, securityType, password, flags } = payload;

    if (typeof ssid !== 'string' || ssid.trim() === '') {
        throw new Error('SSID is required');
    }

    if (typeof securityType !== 'string' || securityType.trim() === '') {
        throw new Error('Security type is required');
    }

    if (typeof password !== 'string') {
        throw new Error('Password must be a string');
    }

    if (flags && typeof flags !== 'object') {
        throw new Error('Flags must be an object when provided');
    }
}

function deriveSessionKey({ pairingSecret, userSecret, deviceId }) {
    const secretMaterial = [pairingSecret, userSecret, deviceId].filter(Boolean).join(':');

    if (!secretMaterial) {
        throw new Error('A pairing secret or user-provided secret is required');
    }

    const salt = crypto.createHash('sha256').update(deviceId || 'default-device').digest();
    return crypto.hkdfSync('sha256', salt, Buffer.from(secretMaterial), Buffer.from('termichemti-bluetooth'), 32);
}

function encryptPayload(payload, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(payload), 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: ciphertext.toString('base64')
    };
}

function decryptPayload(envelope, key) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('Invalid message envelope');
    }

    const { iv, tag, data } = envelope;
    const ivBuffer = Buffer.from(iv, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const ciphertext = Buffer.from(data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    return JSON.parse(plaintext.toString('utf8'));
}

class BluetoothService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.adapter = null;
        this.channel = null;
        this.confirmWindowMs = options.confirmWindowMs || 30000;
        this.approvalExpiresAt = 0;
        this.sessionInfo = null;
        this.backendReady = this.initializeAdapter();
    }

    async initializeAdapter() {
        const backend = await import('node-bluetooth').catch(error => {
            this.emit('warning', {
                scope: 'bluetooth-backend',
                message: 'node-bluetooth module not available; using mock adapter',
                details: error?.message
            });
            return null;
        });

        if (backend?.Bluetooth) {
            this.adapter = new backend.Bluetooth();
        } else {
            this.adapter = this.createMockAdapter();
        }

        if (this.adapter?.on) {
            this.adapter.on('data', (data) => this.handleIncomingData(data));
        }
    }

    createMockAdapter() {
        const adapter = new EventEmitter();
        adapter.isAdvertising = false;

        adapter.startAdvertising = async (options = {}) => {
            adapter.isAdvertising = true;
            adapter.advertisementOptions = options;
            adapter.emit('advertising-started', options);
        };

        adapter.stopAdvertising = async () => {
            adapter.isAdvertising = false;
            adapter.emit('advertising-stopped');
        };

        adapter.openChannel = async () => ({
            write: (buffer, callback) => {
                setTimeout(() => {
                    adapter.emit('data', buffer);
                    if (typeof callback === 'function') {
                        callback();
                    }
                }, 10);
            },
            close: () => adapter.emit('channel-closed')
        });

        return adapter;
    }

    setRendererApproval(approved) {
        this.approvalExpiresAt = approved ? Date.now() + this.confirmWindowMs : 0;
        return { approved: this.hasRendererApproval() };
    }

    hasRendererApproval() {
        return this.approvalExpiresAt > Date.now();
    }

    ensureRendererApproved() {
        if (!this.hasRendererApproval()) {
            throw new Error('Renderer confirmation required before opening Bluetooth channels');
        }
    }

    async startAdvertising(options = {}) {
        this.ensureRendererApproved();
        this.sessionInfo = options.session || this.sessionInfo;
        await this.backendReady;

        if (!this.adapter?.startAdvertising) {
            throw new Error('Bluetooth adapter cannot start advertising');
        }

        await this.adapter.startAdvertising({
            name: options.name || 'Termichemti',
            serviceUuids: options.serviceUuids || [],
            connectable: true
        });

        return { advertising: true, mock: !options.serviceUuids?.length };
    }

    async stopAdvertising() {
        await this.backendReady;
        if (this.adapter?.stopAdvertising) {
            await this.adapter.stopAdvertising();
        }
        return { advertising: false };
    }

    async ensureChannel(options = {}) {
        await this.backendReady;
        if (this.channel) {
            return this.channel;
        }

        if (this.adapter?.openChannel) {
            this.channel = await this.adapter.openChannel(options);
        }

        if (!this.channel || typeof this.channel.write !== 'function') {
            throw new Error('Unable to open Bluetooth channel');
        }

        return this.channel;
    }

    async sendSecurePayload(payload, options = {}) {
        this.ensureRendererApproved();
        validatePayloadSchema(payload);

        const sessionInfo = {
            pairingSecret: options.pairingSecret,
            userSecret: options.userSecret,
            deviceId: options.deviceId || (this.sessionInfo && this.sessionInfo.deviceId)
        };

        this.sessionInfo = this.sessionInfo || sessionInfo;
        const sessionKey = deriveSessionKey(sessionInfo);
        const envelope = encryptPayload(payload, sessionKey);
        const channel = await this.ensureChannel(options.channelOptions);

        const buffer = Buffer.from(JSON.stringify(envelope));
        const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

        await Promise.race([
            new Promise((resolve, reject) => {
                channel.write(buffer, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }),
            delay(timeoutMs).then(() => Promise.reject(new Error('Bluetooth send timed out')))
        ]);

        return { sent: true };
    }

    handleIncomingData(rawData) {
        if (!rawData) {
            return;
        }

        let envelope;
        try {
            envelope = JSON.parse(rawData.toString('utf8'));
        } catch (error) {
            this.emit('error', { code: 'invalid-json', message: error.message });
            return;
        }

        if (!this.sessionInfo) {
            this.emit('error', { code: 'no-session', message: 'Cannot decrypt message without session information' });
            return;
        }

        try {
            const sessionKey = deriveSessionKey(this.sessionInfo);
            const payload = decryptPayload(envelope, sessionKey);
            validatePayloadSchema(payload);
            this.emit('message', payload);
        } catch (error) {
            this.emit('error', { code: 'decrypt-failed', message: error.message });
        }
    }
}

module.exports = { BluetoothService, validatePayloadSchema };
