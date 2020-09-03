/* jshint esversion: 6 */

var json = json || {};

json.TextReader = class {

    constructor(buffer) {
        this._escape = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        this._stack = [];
        if (typeof buffer === 'string') {
            this._decoder = new json.StringDecoder(buffer);
        }
        else if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
            this._decoder = new json.Utf8Decoder(buffer, 3);
        }
        else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
            this._decoder = new json.Utf16Decoder(buffer, 2, false);
        }
        else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
            this._decoder = new json.Utf16Decoder(buffer, 2, true);
        }
        else if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff) {
            throw new json.Error("Unsupported UTF-32 (big-endian) encoding.");
        }
        else if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0x00 && buffer[3] === 0x00) {
            throw new json.Error("Unsupported UTF-32 (little-endian) encoding.");
        }
        else if (buffer.length >= 5 && buffer[0] === 0x2B && buffer[1] === 0x2F && buffer[2] === 0x76 && buffer[3] === 0x38 && buffer[4] === 0x2D) {
            throw new json.Error("Unsupported UTF-7 encoding.");
        }
        else if (buffer.length >= 4 && buffer[0] === 0x2B && buffer[1] === 0x2F && buffer[2] === 0x76 && (buffer[3] === 0x38 || buffer[3] === 0x39 || buffer[3] === 0x2B || buffer[3] === 0x2F)) {
            throw new json.Error("Unsupported UTF-7 encoding.");
        }
        else if (buffer.length >= 4 && buffer[0] === 0x84 && buffer[1] === 0x31 && buffer[2] === 0x95 && buffer[3] === 0x33) {
            throw new json.Error("Unsupported GB-18030 encoding.");
        }
        else {
            this._decoder = new json.Utf8Decoder(buffer, 0);
        }
    }

    static create(buffer) {
        return new json.TextReader(buffer);
    }

    read() {
        this._char = this._decoder.decode();
        this._whitespace();
        let obj = undefined;
        let first = true;
        for (;;) {
            if (Array.isArray(obj)) {
                this._whitespace();
                let c = this._char;
                if (c === ']') {
                    this._read();
                    this._whitespace();
                    if (this._stack.length > 0) {
                        obj = this._stack.pop();
                        first = false;
                        continue;
                    }
                    if (this._char !== undefined) {
                        this._unexpected();
                    }
                    return obj;
                }
                if (!first) {
                    if (this._char !== ',') {
                        this._unexpected();
                    }
                    this._read();
                    this._whitespace();
                    c = this._char;
                }
                first = false;
                switch (c) {
                    case '{': {
                        this._read();
                        this._stack.push(obj);
                        const item = {};
                        obj.push(item);
                        obj = item;
                        first = true;
                        break;
                    }
                    case '[': {
                        this._read();
                        this._stack.push(obj);
                        const item = [];
                        obj.push(item);
                        obj = item;
                        first = true;
                        break;
                    }
                    default: {
                        obj.push(c === '"' ? this._string() : this._literal());
                        break;
                    }
                }
            }
            else if (obj instanceof Object) {
                this._whitespace();
                let c = this._char;
                if (c === '}') {
                    this._read();
                    this._whitespace();
                    if (this._stack.length > 0) {
                        obj = this._stack.pop();
                        first = false;
                        continue;
                    }
                    if (this._char !== undefined) {
                        this._unexpected();
                    }
                    return obj;
                }
                if (!first) {
                    if (this._char !== ',') {
                        this._unexpected();
                    }
                    this._read();
                    this._whitespace();
                    c = this._char;
                }
                first = false;
                if (c === '"') {
                    const key = this._string();
                    this._whitespace();
                    if (this._char !== ':') {
                        this._unexpected();
                    }
                    this._read();
                    this._whitespace();
                    c = this._char;
                    switch (c) {
                        case '{': {
                            this._read();
                            this._stack.push(obj);
                            const value = {};
                            obj[key] = value;
                            obj = value;
                            first = true;
                            break;
                        }
                        case '[': {
                            this._read();
                            this._stack.push(obj);
                            const value = [];
                            obj[key] = value;
                            obj = value;
                            first = true;
                            break;
                        }
                        default: {
                            obj[key] = c === '"' ? this._string() : this._literal();
                            break;
                        }
                    }
                    this._whitespace();
                    continue;
                }
                this._unexpected();
            }
            else {
                const c = this._char;
                switch (c) {
                    case '{': {
                        this._read();
                        obj = {};
                        first = true;
                        break;
                    }
                    case '[': {
                        this._read();
                        obj = [];
                        first = true;
                        break;
                    }
                    default: {
                        const value = c === '"' ? this._string() : c >= '0' && c <= '9' ? this._number() : this._literal();
                        if (this._char !== undefined) {
                            this._unexpected();
                        }
                        return value;
                    }
                }
                this._whitespace();
            }
        }
    }

    _read() {
        if (this._char === undefined) {
            this._unexpected();
        }
        this._position = this._decoder.position;
        this._char = this._decoder.decode();
    }

    _expect(text) {
        for (let i = 0; i < text.length; i++) {
            if (text[i] !== this._char) {
                this._unexpected();
            }
            this._read();
        }
    }

    _unexpected() {
        let c = this._char;
        if (c === undefined) {
            throw new json.Error('Unexpected end of JSON input.');
        }
        else if (c === '"') {
            c = 'string';
        }
        else if ((c >= '0' && c <= '9') || c === '-') {
            c = 'number';
        }
        else {
            if (c < ' ' || c > '\x7F') {
                const name = Object.keys(this._escape).filter((key) => this._escape[key] === c);
                c = (name.length === 1) ? '\\' + name : '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
            }
            c = "token '" + c + "'";
        }
        throw new json.Error('Unexpected ' + c + this._location());
    }

    _whitespace() {
        while (this._char === ' ' || this._char === '\n' || this._char === '\r' || this._char === '\t') {
            this._read();
        }
    }

    _literal() {
        const c = this._char;
        if (c >= '0' && c <= '9') {
            return this._number();
        }
        switch (c) {
            case 't': this._expect('true'); return true;
            case 'f': this._expect('false'); return false;
            case 'n': this._expect('null'); return null;
            case 'N': this._expect('NaN'); return NaN;
            case 'I': this._expect('Infinity'); return Infinity;
            case '-': return this._number();
        }
        this._unexpected();
    }

    _number() {
        let value = '';
        if (this._char === '-') {
            value = '-';
            this._read('-');
        }
        if (this._char === 'I') {
            this._expect('Infinity');
            return -Infinity;
        }
        const c = this._char;
        if (c < '0' || c > '9') {
            this._unexpected();
        }
        value += c;
        this._read();
        if (c === '0') {
            const n = this._char;
            if (n >= '0' && n <= '9') {
                throw new json.Error('Unexpected number' + this._location());
            }
        }
        while (this._char >= '0' && this._char <= '9') {
            value += this._char;
            this._read();
        }
        if (this._char === '.') {
            value += '.';
            this._read();
            const n = this._char;
            if (n < '0' || n > '9') {
                this._unexpected();
            }
            while (this._char >= '0' && this._char <= '9') {
                value += this._char;
                this._read();
            }
        }
        if (this._char === 'e' || this._char === 'E') {
            value += this._char;
            this._read();
            const s = this._char;
            if (s === '-' || s === '+') {
                value += this._char;
                this._read();
            }
            const c = this._char;
            if (c < '0' || c > '9') {
                this._unexpected();
            }
            value += this._char;
            this._read();
            while (this._char >= '0' && this._char <= '9') {
                value += this._char;
                this._read();
            }
        }
        return +value;
    }

    _string() {
        let value = '';
        this._read();
        while (this._char != '"') {
            if (this._char === '\\') {
                this._read();
                if (this._char === 'u') {
                    this._read();
                    let uffff = 0;
                    for (let i = 0; i < 4; i ++) {
                        const hex = parseInt(this._char, 16);
                        if (!isFinite(hex)) {
                            this._unexpected();
                        }
                        this._read();
                        uffff = uffff * 16 + hex;
                    }
                    value += String.fromCharCode(uffff);
                }
                else if (this._escape[this._char]) {
                    value += this._escape[this._char];
                    this._read();
                }
                else {
                    this._unexpected();
                }
            }
            else if (this._char < ' ') {
                this._unexpected();
            }
            else {
                value += this._char;
                this._read();
            }
        }
        this._read();
        return value;
    }

    _location() {
        let line = 1;
        let column = 1;
        this._decoder.position = 0;
        let c;
        do {
            if (this._decoder.position === this.position) {
                return ' at ' + line.toString() + ':' + column.toString() + '.';
            }
            c = this._decoder.decode();
            if (c === '\n') {
                line++;
                column = 0;
            }
            else {
                column++;
            }
        }
        while (c !== undefined);
        return ' at ' + line.toString() + ':' + column.toString() + '.';
    }
};

json.StringDecoder = class {

    constructor(buffer) {
        this.buffer = buffer;
        this.position = 0;
        this.length = buffer.length;
    }

    decode() {
        if (this.position < this.length) {
            return this.buffer[this.position++];
        }
        return undefined;
    }
};

json.Utf8Decoder = class {

    constructor(buffer, position) {
        this.position = position || 0;
        this.buffer = buffer;
    }

    decode() {
        const c = this.buffer[this.position];
        if (c === undefined) {
            return c;
        }
        this.position++;
        if (c < 0x80) {
            return String.fromCodePoint(c);
        }
        switch (c >> 4) {
            case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
                return String.fromCodePoint(c);
            case 12: case 13: {
                const c2 = this._read();
                return String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F));
            }
            case 14: {
                const c2 = this._read();
                const c3 = this._read();
                return String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | ((c3 & 0x3F) << 0));
            }
            case 15: {
                const c2 = this._read();
                const c3 = this._read();
                const c4 = this._read();
                return String.fromCodePoint(((c & 0x07) << 18) | ((c2 & 0x3F) << 12) | ((c3 & 0x3F) << 6) | (c4 & 0x3F));
            }
            default: {
                throw new json.Error("Invalid utf-8 character code '" + c.toString() + "' at position " + (this.position - 1) + '.');
            }
        }
    }

    _read() {
        const c = this.buffer[this.position];
        if (c === undefined) {
            throw new json.Error('The encoded data was not valid for encoding utf-8.');
        }
        this.position++;
        return c;
    }
};

json.Utf16Decoder = class {

    constructor(buffer, position, littleEndian) {
        this.buffer = buffer;
        this.position = position || 0;
        this.length = buffer.length;
        this.littleEndian = littleEndian;
    }

    decode() {
        if (this.position + 1 < this.length) {
            const c = this.littleEndian ?
                (this.buffer[this.position++] | (this.buffer[this.position++] << 8)) :
                ((this.buffer[this.position++] << 8) | this.buffer[this.position++]);
            if ((c & 0xF800) !== 0xD800) {
                return String.fromCharCode(c);
            }
            if ((c & 0xFC00) === 0xD800) {
                throw new RangeError('Invalid utf-16 octet 0x' + c.toString(16) + this._location());
            }
            const c2 = this._read();
            if ((c2 & 0xFC00) !== 0xDC00) {
                throw new RangeError('Invalid utf-16 octet 0x' + c2.toString(16) + this._location());
            }
            return String.fromCodePoint(((c & 0x3ff) << 10) + (c2 & 0x3ff) + 0x10000);
        }
        return undefined;
    }

    _read() {
        if (this._position + 1 < this._length) {
            return this._littleEndian ?
                (this._buffer[this._position++] | (this._buffer[this._position++] << 8)) :
                ((this._buffer[this._position++] << 8) | this._buffer[this._position++]);
        }
        throw new json.Error('The encoded data was not valid for encoding utf-16.');
    }
};

json.Error = class extends Error {

    constructor(message) {
        super(message);
        this.name = 'JSON Error';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.TextReader = json.TextReader;
}
