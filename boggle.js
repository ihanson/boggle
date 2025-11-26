const BigBoggleDice = [
	["A", "A", "A", "F", "R", "S"],
	["A", "A", "E", "E", "E", "E"],
	["A", "A", "F", "I", "R", "S"],
	["A", "D", "E", "N", "N", "N"],
	["A", "E", "E", "E", "E", "M"],
	["A", "E", "E", "G", "M", "U"],
	["A", "E", "G", "M", "N", "N"],
	["A", "F", "I", "R", "S", "Y"],
	["B", "J", "K", "Qu", "X", "Z"],
	["C", "C", "E", "N", "S", "T"],
	["C", "E", "I", "I", "L", "T"],
	["C", "E", "I", "L", "P", "T"],
	["C", "E", "I", "P", "S", "T"],
	["D", "D", "H", "N", "O", "T"],
	["D", "H", "H", "L", "O", "R"],
	["D", "H", "L", "N", "O", "R"],
	["D", "H", "L", "N", "O", "R"],
	["E", "I", "I", "I", "T", "T"],
	["E", "M", "O", "T", "T", "T"],
	["E", "N", "S", "S", "S", "U"],
	["F", "I", "P", "R", "S", "Y"],
	["G", "O", "R", "R", "V", "W"],
	["I", "P", "R", "R", "R", "Y"],
	["N", "O", "O", "T", "U", "W"],
	["O", "O", "O", "T", "T", "U"]
];

const WordListURL = "https://raw.githubusercontent.com/wordnik/wordlist/refs/heads/main/wordlist-20210729.txt";

/**
 * @typedef BoggleGameParams
 * @property {number} gameLength
 * @property {string[][]} grid
 */
/** @typedef {typeof BoggleGrid} BoggleGridClass */

class BoggleGame {
	constructor(
		/** @type {BoggleGameParams} */ params,
		startTime = params.gameLength
	) {
		this.#params = params;
		this.#grid = new BoggleGrid(params.grid);
		this.#controls = document.createElement("div");
		this.#controls.classList.add("controls");
		this.#main = document.createElement("div");
		this.#main.classList.add("main");
		this.#reveal = document.createElement("result");
		this.#reveal.classList.add("reveal");
		this.#container = document.createElement("div");
		this.#container.classList.add("boggle");
		this.#container.appendChild(this.#main);
		this.#container.appendChild(this.#reveal);
		this.#startTime = startTime;
		this.#worker = new WorkerBox(
			async (
				/** @type {[BoggleGridClass, string]} */ [BoggleGrid, WordListURL],
				/** @type {string} */ serial
			) => {
				const grid = BoggleGrid.deserialize(serial);
				const request = await fetch(WordListURL);
				if (request.status === 200) {
					const words = (await request.text())
						.trim().split(/\s+/)
						.map((wordJSON) => JSON.parse(wordJSON).toLocaleUpperCase());
					console.log(`Loaded ${words.length.toLocaleString()} words`);
					return [
						words,
						words.filter((word) => word.length >= 4)
							.filter((word) => grid.makeWord(word))
					];
				} else {
					throw new Error(await request.text());
				}
			}, [BoggleGrid, WordListURL], this.#grid.serialize()
		);
		this.#validWords = this.#worker.promise().then(([, validWords]) => new Set(validWords)).catch((e) => {
			alert(`Error loading word list: ${e}`);
			/** @type {Set<string>} */
			 const s = new Set();
			 return s;
		});
		this.#allWords = this.#worker.promise().then(([allWords]) => new Set(allWords));
		this.#validWords.then(() => console.log("Word search complete"));
		this.#wakeLock = null;
		document.addEventListener("visibilitychange", () => {
			if (this.#wakeLock && document.visibilityState === "visible") {
				this.#createWakeLock();
			}
		});
	}

	static #formatTime(/** @type {number} */ time) {
		return `${
			Math.floor(time / 60).toLocaleString()
		}:${
			(time % 60).toLocaleString().padStart(2, "0")
		}`;
	}

	async #createWakeLock() {
		if (this.#wakeLock && !this.#wakeLock.released) {
			return;
		}
		if (!navigator.wakeLock) {
			return;
		}
		try {
			this.#wakeLock = await navigator.wakeLock.request();
		} catch { }
	}

	async #releaseWaitLock() {
		if (!this.#wakeLock) {
			return;
		}
		await this.#wakeLock.release();
		this.#wakeLock = null;
	}

	renderGame(
		/** @type {HTMLElement} */ target,
		/** @type {boolean} */ flat,
		startImmediately = false
	) {
		const domGrid = new DOMGrid(this.#grid, flat, this.#startTime <= this.#params.gameLength / 2);
		domGrid.renderTo(this.#main);
		this.#main.appendChild(this.#controls);
		target.textContent = "";
		target.appendChild(this.#container);
		const startButton = document.createElement("button");
		startButton.classList.add("timerButton", "default");
		startButton.appendChild(document.createTextNode("Start"));
		const timerButton = document.createElement("button");
		timerButton.classList.add("timerButton");
		timerButton.innerText = "Pause";
		const timerDiv = document.createElement("div");
		timerDiv.classList.add("timer");
		const silence = new Audio("Resources/silence.mp3");
		silence.loop = true;
		const timer = new Timer(this.#startTime)
			.everySecond((/** @type {number} */ time) => {
				timerDiv.innerText = BoggleGame.#formatTime(time);
				globalThis.localStorage.setItem("currentGameTime", JSON.stringify(time));
			})
			.at(Math.floor(this.#params.gameLength / 2) + 2, () => {
				new Audio("Resources/warning.mp3").play();
			})
			.at(Math.floor(this.#params.gameLength / 2), () => {
				domGrid.setRotated();
			})
			.onComplete((isEarly) => {
				if (!isEarly) {
					new Audio("Resources/complete.mp3").play();
					domGrid.setFinished();
					domGrid.flashText("Time!");
				}
				silence.pause();
				timerButton.parentElement.removeChild(timerButton);
				timerDiv.parentElement.removeChild(timerDiv);
				const [wordChecker, wordInput] = this.#wordChecker(domGrid);
				this.#controls.appendChild(wordChecker);
				globalThis.localStorage.removeItem("currentGame");
				globalThis.localStorage.removeItem("currentGameTime");
				setTimeout(() => this.#showAllWords(wordInput), 0);
				this.#releaseWaitLock();
			});
		const tick = new Audio("Resources/tick.wav");
		for (let second = 1; second <= 10; second++) {
			timer.at(second, () => tick.play());
		}
		const startTimer = () => {
			timer.start();
			silence.play();
			this.#createWakeLock();
			timerButton.style.removeProperty("visibility");
			domGrid.showLetters();
		};
		const pauseTimer = async () => {
			timer.stop();
			silence.pause();
			this.#releaseWaitLock();
			timerButton.style.visibility = "hidden";
			domGrid.hideLetters();
			const result = await showPrompt(
				this.#main,
				null,
				[["Resume Game", "resume"], ["End Game", "end"]]
			);
			domGrid.showLetters();
			if (result === "resume") {
				startTimer();
			} else {
				timer.endEarly();
			}
		};
		startButton.addEventListener("click", async () => {
			const time = 1000;
			startButton.style.visibility = "hidden";
			if (this.#params.gameLength > 0 && !startImmediately) {
				for (let count = 3; count > 0; count--) {
					domGrid.flashText(count.toLocaleString(), time, "200pt");
					await sleep(time);
				}
				await sleep(time * 0.1);
			}
			globalThis.localStorage.setItem("currentGame", JSON.stringify(this.#params));
			globalThis.localStorage.setItem("currentGameTime", JSON.stringify(this.#params.gameLength));
			startButton.parentNode.replaceChild(timerButton, startButton);
			startTimer();
		});
		timerButton.addEventListener("click", () => {
			if (timer.isRunning()) {
				pauseTimer();
			} else {
				startTimer();
			}
		})
		this.#controls.appendChild(startButton);
		this.#controls.appendChild(timerDiv);
		startButton.focus();
		if (startImmediately) {
			startButton.click();
		}
	}

	/** @returns {[HTMLDivElement, HTMLInputElement]} */
	#wordChecker(/** @type {DOMGrid} */ domGrid) {
		const MinLength = 4;
		const collinsThrottle = new Throttle(1000);
		const div = document.createElement("div");
		const textbox = document.createElement("input");
		const result = document.createElement("div");
		result.classList.add("result");
		textbox.setAttribute("placeholder", "Check a word");
		textbox.addEventListener("input", async () => {
			const word = textbox.value.toLocaleUpperCase().replace(/[^A-Z]/g, "");
			const wordPath = this.#grid.makeWord(word);
			domGrid.selectPath(wordPath);
			result.innerText = "";
			if (word.length < MinLength) {
				return;
			}
			result.classList.remove("valid");
			try {
				const lookupPromise = this.collinsResult(word, collinsThrottle);
				const isRealWord = (await this.#allWords).has(word) || (await lookupPromise).success;
				if (!wordPath) {
					if (isRealWord) {
						result.appendChild(document.createTextNode("You cannot make "));
						result.appendChild(BoggleGame.#dictionaryLink(word));
						result.appendChild(document.createTextNode(" with these letters."));
						result.appendChild(BoggleGame.#wikiLink(word));
					} else {
						result.innerText = `You cannot make ${word} with these letters.`;
					}
				} else if (isRealWord) {
					result.appendChild(BoggleGame.#dictionaryLink(word));
					result.appendChild(document.createTextNode(" is a valid word!"));
					result.appendChild(BoggleGame.#wikiLink(word));
					result.classList.add("valid");
				} else {
					result.innerText = `${word} is not a valid word.`;
				}
				if (wordPath && isRealWord) {
					const lookupResult = await lookupPromise;
					if (lookupResult.from) {
						result.appendChild(BoggleGame.#definitionElement(lookupResult.from));
						result.appendChild(BoggleGame.#definitionElement(lookupResult));
					} else {
						result.appendChild(BoggleGame.#definitionElement(lookupResult));
					}
				}
			} catch (e) {
				console.error(e);
			}
		});
		div.appendChild(textbox);
		div.appendChild(result);
		return [div, textbox];
	}

	async #showAllWords(/** @type {HTMLInputElement} */ wordInput) {
		const words = [...await this.#validWords];
		const button = document.createElement("button");
		button.appendChild(document.createTextNode("\xab"));
		button.classList.add("expand");
		button.addEventListener("click", () => {
			button.parentElement.removeChild(button);
			this.#container.classList.add("showReveal");
			this.#reveal.scroll({behavior: "instant", top: 0, left: 0});
		});
		this.#container.appendChild(button);
		const callback = (/** @type {string} */ word) => {
			wordInput.value = word;
			wordInput.dispatchEvent(new Event("input"));
		};
		const wordsByLength = BoggleGame.#group(
			words,
			(/** @type {string} */ word) => word.length
		);
		const lists = [...wordsByLength.keys()]
			.sort((a, b) => b - a)
			.map((len) => BoggleGame.#wordList(
				[...wordsByLength.get(len)].sort((a, b) => a.localeCompare(b)),
				callback
			));
		for (const list of lists) {
			this.#reveal.appendChild(list);
		}
	}

	/** @returns {Promise<CollinsLookupResult>} */
	async collinsResult(
		/** @type {string} */ word,
		throttle = new Throttle(0)
	) {
		if (this.#lookupResults.has(word)) {
			return this.#lookupResults.get(word);
		}
		const url = `https://scrabblechecker.collinsdictionary.com/check/api/index.php?key=${encodeURIComponent(word.toLocaleLowerCase())}`;
		return throttle.maybeDoTask(async () => {
			const request = await fetch(url)
			if (request.status !== 200) {
				throw new Error(await request.text());
			}
			/** @type {CollinsLookupResult} */
			const result = await request.json();
			const resolvedResult = result.data?.see
				? {
					from: result,
					...await this.collinsResult(result.data.definition)
				}
				: result;
			this.#lookupResults.set(word, resolvedResult);
			return resolvedResult;
		});
	}

	/** @template V, K */
	static #group(
		/** @type {V[]} */ list,
		/** @type {(val: V) => K} */ groupBy
	) {
		/** @type {Map<K, Set<V>>} */
		const map = new Map();
		for (const item of list) {
			const val = groupBy(item);
			if (!map.has(val)) {
				map.set(val, new Set());
			}
			map.get(val).add(item);
		}
		return map;
	}

	static #wordList(
		/** @type {string[]} */ words,
		/** @type {(word: string) => void} */ onClick
	) {
		const ul = document.createElement("ul");
		for (const word of words) {
			const li = document.createElement("li");
			const wordButton = document.createElement("button");
			wordButton.classList.add("word");
			wordButton.appendChild(document.createTextNode(word.toLocaleLowerCase()));
			wordButton.addEventListener("click", () => onClick(word));
			li.appendChild(wordButton);
			ul.appendChild(li);
		}
		return ul;
	}

	static #dictionaryLink(/** @type {string} */ word) {
		const a = document.createElement("a");
		a.setAttribute("href", `https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(word.toLocaleLowerCase())}`);
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noreferrer");
		a.appendChild(document.createTextNode(word));
		return a;
	}

	static #wikiLink(/** @type {string} */ word) {
		const a = document.createElement("a");
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noreferrer");
		a.setAttribute("href", `https://en.wiktionary.org/w/index.php?search=${encodeURIComponent(word.toLocaleLowerCase())}`);
		a.classList.add("wiki");
		const img = document.createElement("img");
		img.setAttribute("src", "Resources/wiktionary.svg");
		img.setAttribute("alt", "Wiktionary");
		img.setAttribute("title", "Wiktionary");
		a.appendChild(img);
		return a;
	}

	/**
	 * @typedef CollinsLookupResult
	 * @property {CollinsLookupResult=} from
	 * @property {true=} success
	 * @property {{
	 * 	   see?: string,
	 *     definition?: string,
	 *     posp?: string,
	 *     complete_definition?: string
	 * }=} data
	 */
	static #definitionElement(/** @type {CollinsLookupResult} */ lookupResult) {
		const container = document.createElement("div");
		container.classList.add("definition");
		if (lookupResult.data?.see) {
			const seeSpan = document.createElement("span");
			seeSpan.classList.add("see");
			seeSpan.appendChild(document.createTextNode(`${lookupResult.data.see} `));
			container.appendChild(seeSpan);
			const defSpan = document.createElement("span");
			defSpan.appendChild(document.createTextNode(lookupResult.data.definition));
			container.appendChild(defSpan);
		} else if (lookupResult.success) {
			const dl = document.createElement("dl");
			const partsOfSpeech = lookupResult.data.posp.split("###");
			const definitions = lookupResult.data.complete_definition.split("###");
			for (let i = 0; i < definitions.length; i++) {
				const partOfSpeech = partsOfSpeech[i];
				const definition = definitions[i];
				if (partOfSpeech) {
					const dt = document.createElement("dt");
					dt.textContent = partOfSpeech;
					dl.appendChild(dt);
				}
				if (definition) {
					const dd = document.createElement("dd");
					dd.textContent = definition;
					dl.appendChild(dd);
				}
			}
			container.appendChild(dl);
		}
		return container;
	}

	#params;
	#container;
	#main;
	#controls;
	#reveal;
	#grid;
	#startTime;
	/** @type {WorkerBox<[BoggleGridClass, string], string, [string[], string[]]>} */
	#worker;
	#allWords;
	#validWords;
	#lookupResults = new Map();
	/** @type {WakeLockSentinel | null} */
	#wakeLock;
}

class DOMGrid {
	constructor(
		/** @type {BoggleGrid} */ grid,
		/** @type {boolean} */ flat,
		/** @type {boolean} */ rotated=false
	) {
		this.#boardDiv = document.createElement("div");
		this.#boardDiv.setAttribute("role", "grid");
		this.#boardDiv.classList.add("board");
		this.#boardDiv.style.setProperty("--board-size", grid.letters.length.toString());
		if (flat) {
			this.#boardDiv.classList.add("flat");
		}
		this.#rows = grid.letters.map(
			(row) => row.map((letter) => ({
				div: DOMGrid.#letterDiv(flat),
				letter
			}))
		);
		this.#rows[0]?.[0].div.setAttribute("tabindex", "0");
		const gridHandler = new GridHandler(this.#rows);
		for (const [y, row] of this.#rows.entries()) {
			const rowDiv = document.createElement("div");
			rowDiv.setAttribute("role", "row");
			for (const [x, {div}] of row.entries()) {
				rowDiv.appendChild(div);
				div.addEventListener(
					"keydown",
					(event) => gridHandler.handleKeyDown(event, x, y, this.#rotated)
				);
			}
			this.#boardDiv.appendChild(rowDiv);
		}
		
		this.#boardContainer = document.createElement("div");
		this.#boardContainer.classList.add("boardContainer");
		this.#boardContainer.appendChild(this.#boardDiv);
		if (rotated) {
			this.setRotated();
		}
	}

	renderTo(/** @type {HTMLElement} */ target) {
		target.appendChild(this.#boardContainer);
	}

	setRotated() {
		this.#boardDiv.classList.add("rotated");
		if (this.#rows.length > 0) {
			this.#rows[0][0].div.setAttribute("tabindex", "-1");
			const lastRow = this.#rows.length - 1;
			const lastCol = this.#rows[lastRow].length -1;
			this.#rows[lastRow][lastCol].div.setAttribute("tabindex", "0");
			this.#rotated = true;
		}
	}

	showLetters() {
		for (const row of this.#rows) {
			for (const {letter, div} of row) {
				div.setAttribute("data-letter", letter);
				const letterDiv = div.firstElementChild;
				letterDiv.textContent = letter;
			}
		}
	}

	hideLetters() {
		for (const row of this.#rows) {
			for (const {div} of row) {
				div.firstChild.textContent = "";
			}
		}
	}

	selectPath(/** @type {[number, number][]} */ wordPath) {
		for (const [y, row] of this.#rows.entries()) {
			for (const [x, {div}] of row.entries()) {
				div.classList.toggle("selected", !!wordPath && wordPath.some(
					([pathX, pathY]) => pathX === x && pathY === y)
				);
			}
		}
	}
	
	flashText(
		/** @type {string} */ text,
		duration = 1000,
		fontSize = "120pt"
	) {
		const div = document.createElement("div");
		div.classList.add("flash");
		div.style.setProperty("--duration", `${duration / 1000}s`);
		div.style.fontSize = fontSize;
		div.textContent = text;
		div.style.visibility = "none";
		document.firstElementChild.appendChild(div);
		const textRect = div.getBoundingClientRect();
		const targetRect = this.#boardDiv.getBoundingClientRect();
		div.style.left = `${targetRect.left + (targetRect.width / 2) - (textRect.width / 2)}px`;
		div.style.top = `${targetRect.top + (targetRect.height / 2) - (textRect.height / 2)}px`;
		div.classList.add("animating");
		div.style.removeProperty("visibility");
		div.addEventListener("animationend", () => {
			div.parentNode.removeChild(div);
		});
	}

	setFinished() {
		this.#boardDiv.classList.add("finished");
	}

	static #letterDiv(/** @type {boolean} */ flat) {
		const letterDiv = document.createElement("div");
		const innerDiv = document.createElement("div");
		if (flat) {
			const angle = Math.floor(Math.random() * 4) * 90;
			innerDiv.style.transform = `rotate(${angle}deg)`;
		}
		letterDiv.classList.add("cell");
		letterDiv.setAttribute("tabindex", "-1");
		letterDiv.setAttribute("role", "gridcell");
		letterDiv.appendChild(innerDiv);
		return letterDiv;
	}

	#boardContainer;
	#boardDiv;
	#rows;
	#rotated = false;
}

class BoggleGrid {
	constructor(/** @type {string[][]} */ letters) {
		this.letters = letters;
	}

	serialize() {
		return JSON.stringify(this.letters);
	}

	static deserialize(/** @type {string} */ serial) {
		return new BoggleGrid(JSON.parse(serial));
	}

	static fromString(/** @type {string} */ letters) {
		const rows = [];
		const size = Math.floor(Math.sqrt(letters.length));
		for (let y = 0; y < size; y++) {
			const row = []
			for (let x = 0; x < size; x++) {
				const letter = letters[y * size + x];
				row.push(letter === "Q" ? "Qu" : letter);
			}
			rows.push(row);
		}
		return rows;
	}

	static fromDice(/** @type {string[][]} */ diceSource) {
		const dice = [...diceSource];
		BoggleGrid.#shuffleArray(dice);
		const letters = dice.map((die) => die[BoggleGrid.#randomInt(0, die.length - 1)]);
		const rows = [];
		const size = Math.sqrt(letters.length);
		for (let row = 0; row < size; row++) {
			rows.push(letters.slice(row * size, (row + 1) * size));
		}
		return rows
	}

	/** @template T */
	static #shuffleArray(/** @type {T[]} */ arr) {
		for (let i = 0; i < arr.length; i++) {
			const j = BoggleGrid.#randomInt(i, arr.length - 1);
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	static #randomInt(
		/** @type {number} */ start,
		/** @type {number} */ end
	) {
		return Math.floor(Math.random() * (end - start + 1)) + start;
	}

	makeWord(/** @type {string} */ word) {
		const wordArr = [...word]
		for (const [rowIndex, row] of this.letters.entries()) {
			for (const [colIndex] of row.entries()) {
				const result = this.#makeWordHelper(wordArr, colIndex, rowIndex, []);
				if (result) {
					return result;
				}
			}
		}
		return null;
	}

	/** @returns {[number, number][]} */
	#makeWordHelper(
		/** @type {string[]} */ word,
		/** @type {number} */ colIndex,
		/** @type {number} */ rowIndex,
		/** @type {[number, number][]} */ seen
	) {
		if (word.length === 0) {
			return [];
		}
		const letter = this.letters[rowIndex][colIndex].toLocaleUpperCase();
		if (word.slice(0, letter.length).join("").toLocaleUpperCase() === letter) {
			if (word.length === letter.length) {
				return [[colIndex, rowIndex]];
			}
			for (const dx of [-1, 0, 1]) {
				for (const dy of [-1, 0, 1]) {
					if (dx === 0 && dy === 0) {
						continue;
					}
					const x = colIndex + dx;
					const y = rowIndex + dy;
					if (seen.some(([seenX, seenY]) => seenX === x && seenY === y)) {
						continue;
					}
					if (0 <= y && y < this.letters.length && 0 <= x && x < this.letters[y].length) {
						const result = this.#makeWordHelper(word.slice(letter.length), x, y, [...seen, [colIndex, rowIndex]]);
						if (result) {
							return [[colIndex, rowIndex], ...result];
						}
					}
				}
			}
		}
		return null;
	}
}

class Timer {
	constructor(/** @type {number} */ seconds) {
		this.#time = seconds;
		this.#everySecond = [];
		this.#at = new Map();
		this.#onComplete = [];
	}

	everySecond(/** @type {(second: number) => void} */ callback) {
		this.#everySecond.push(callback);
		return this;
	}

	at(
		/** @type {number} */ time,
		/** @type {() => void} */ callback
	) {
		if (!this.#at.has(time)) {
			this.#at.set(time, []);
		}
		this.#at.get(time).push(callback);
		return this;
	}

	onComplete(/** @type {(isEarly: boolean) => void} */ callback) {
		this.#onComplete.push(callback);
		return this;
	}

	isRunning() {
		return typeof this.#interval == "number";
	}

	start() {
		this.stop();
		this.#interval = setInterval(() => {
			this.#time--;
			this.#handleSecond();
		}, 1000);
		this.#handleSecond();
	}

	stop() {
		if (this.isRunning()) {
			clearInterval(this.#interval);
			this.#interval = null;
		}
	}

	endEarly() {
		if (this.#time >= 0) {
			this.#handleEnd(true);
			this.#time = 0;
		}
	}

	#handleSecond() {
		for (const callback of this.#everySecond) {
			callback.call(null, this.#time);
		}
		for (const callback of this.#at.get(this.#time) ?? []) {
			callback.call(null);
		}
		if (this.#time <= 0) {
			this.#handleEnd(false);
		}
	}

	#handleEnd(/** @type {boolean} */ isEarly) {
		for (const callback of this.#onComplete) {
			callback.call(null, isEarly);
		}
		this.stop();
	}

	#time
	/** @type {((second: number) => void)[]} */
	#everySecond
	/** @type {Map<number, (() => void)[]>} */
	#at
	/** @type {((isEarly: boolean) => void)[]} */
	#onComplete
	/** @type {number | null} */
	#interval
}

class Throttle {
	constructor(/** @type {number} */ milliseconds) {
		this.#milliseconds = milliseconds;
	}

	/** @template T */
	maybeDoTask(/** @type {() => Promise<T>} */ task) {
		const now = performance.now();
		if (this.#currentTimeout !== null) {
			clearTimeout(this.#currentTimeout);
			this.#currentTimeout = null;
		}
		const waitTime = this.#lastEventTime === null
			? 0
			: Math.max(this.#milliseconds - (now - this.#lastEventTime), 0);
		/** @type {(value: T) => void} */
		let resolve;
		/** @type {Promise<T>} */
		const promise = new Promise((r) => {
			resolve = r;
		});
		const thisTimeout = setTimeout(async () => {
			if (this.#currentTimeout === thisTimeout) {
				this.#lastEventTime = performance.now();
				const result = await task.call();
				if (this.#currentTimeout === thisTimeout) {
					this.#currentTimeout = null;
					resolve(result);
				}
			}
		}, waitTime);
		this.#currentTimeout = thisTimeout;
		return promise;
	}

	#milliseconds;
	/** @type {number | null} */
	#currentTimeout = null;
	/** @type {number | null} */
	#lastEventTime = null;
}

/** @template DependencyType, DataType, ReturnType */
class WorkerBox {
	/** @typedef {(deps: DependencyType[], data: DataType) => void} WorkerCallback */
	constructor(
		/** @type {WorkerCallback} */ f,
		/** @type {DependencyType[]} */ deps,
		/** @type {DataType} */ data
	) {
		const caller = (
			/** @type {WorkerCallback} */ f,
			/** @type {DependencyType[]} */ deps
		) => {
			addEventListener("message", async ({data}) => {
				try {
					postMessage({"success": await f(deps, data)});
				} catch (e) {
					postMessage({"error": e.message});
				}
			});
		};
		const script = `(${caller.toString()})(${f.toString()}, [${deps.map((v) => WorkerBox.#stringify(v)).join(",")}]);`;
		this.#worker = new Worker(`data:application/javascript,${encodeURIComponent(script)}`);
		/**
		 * @typedef Message
		 * @property {{success?: ReturnType, error: any}} data
		 */
		this.#promise = new Promise((resolve, reject) => {
			/** @type {EventListenerObject} */
			this.#worker.addEventListener(
				"message",
				(/** @type {Message} */ {data}) => {
					if (data.success) {
						resolve(data.success);
					} else {
						reject(data.error);
					}
				}
			);
			this.#worker.postMessage(data);
		});
	}

	promise() {
		return this.#promise;
	}

	static #stringify(/** @type {unknown} */ object) {
		return (
			object instanceof Function
				? object.toString()
				: JSON.stringify(object)
		);
	}

	#worker;
	/** @type {Promise<ReturnType>} */ #promise;
}

function sleep(/** @type {number} */ time) {
	return new Promise((resolve) => setTimeout(() => resolve(), time));
}

/**
 * @typedef DOMGridElement
 * @property {HTMLDivElement} div
 * @property {string} letter
 */
class GridHandler {
	constructor(/** @type {DOMGridElement[][]} */ rows) {
		this.#rows = rows;
	}

	handleKeyDown(
		/** @type {KeyboardEvent} */ event,
		/** @type {number} */ x,
		/** @type {number} */ y,
		/** @type {boolean} */ rotated
	) {
		if (event.altKey || event.shiftKey || event.metaKey) {
			return;
		}
		const newCoords = GridHandler.#nextCell(
			rotated ? GridHandler.#reverseKey(event.key) : event.key,
			event.ctrlKey,
			x, y,
			this.#rows.length,
			this.#rows[y].length
		);
		if (newCoords) {
			const [newX, newY] = newCoords;
			this.#rows[newY][newX].div.focus();
			event.preventDefault();
		}
	}

	static #reverseKey(/** @type {string} */ key) {
		switch (key) {
			case "ArrowLeft": return "ArrowRight";
			case "ArrowRight": return "ArrowLeft";
			case "ArrowUp": return "ArrowDown";
			case "ArrowDown": return "ArrowUp";
			case "Home": return "End";
			case "End": return "Home";
			default: return key;
		}
	}

	static #nextCell(
		/** @type {string} */ key,
		/** @type {boolean} */ ctrl,
		/** @type {number} */ x,
		/** @type {number} */ y,
		/** @type {number} */ numRows,
		/** @type {number} */ numCols
	) {
		switch (key) {
			case "ArrowLeft": return [Math.max(x - 1, 0), y];
			case "ArrowRight": return [Math.min(x + 1, numCols - 1), y];
			case "ArrowUp": return [x, Math.max(y - 1, 0)];
			case "ArrowDown": return [x, Math.min(y + 1, numRows - 1)];
			case "Home": return ctrl ? [0, 0] : [0, y];
			case "End": return ctrl ? [numCols - 1, numRows - 1] : [numCols - 1, y];
			default: return null;
		}
	}

	#rows
}

/** @template T */
function showPrompt(
	/** @type {HTMLElement} */ element,
	/** @type {string | null} */ promptText,
	/** @type {[string, T][]} */ buttons,
	/** @type {number} */ defaultIndex = 0
) {
	const dialog = document.createElement("dialog");
	if (promptText) {
		const textDiv = document.createElement("div");
		textDiv.classList.add("text");
		textDiv.textContent = promptText;
		dialog.ariaLabelledByElements = [textDiv];
		dialog.appendChild(textDiv);
	}
	const buttonDiv = document.createElement("div");
	buttonDiv.classList.add("buttons");
	/** @type {(result: T) => void} */
	let resolvePromise;
	/** @type {Promise<T>} */
	const promise = new Promise((resolve) => {
		resolvePromise = resolve;
	});
	for (const [index, [text, value]] of buttons.entries()) {
		const button = document.createElement("button");
		button.textContent = text;
		button.addEventListener("click", () => {
			dialog.parentElement.removeChild(dialog);
			resolvePromise(value);
		});
		button.addEventListener("keypress", (e) => {
			e.stopPropagation();
		});
		if (index === defaultIndex) {
			button.classList.add("default");
			dialog.addEventListener("keypress", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					button.click();
				}
			});
		}
		buttonDiv.appendChild(button);
	}
	dialog.appendChild(buttonDiv);
	element.appendChild(dialog);
	dialog.showModal();
	return promise;
}

async function startGame() {
	/** @returns {BoggleGameParams} */
	function parseParams(/** @type {string} */ paramStr) {
		return JSON.parse(paramStr);
	}
	const urlParams = new URLSearchParams(globalThis.location.search);
	const currentGame = globalThis.localStorage.getItem("currentGame");
	const currentGameTime = globalThis.localStorage.getItem("currentGameTime");
	const continueGame = !!currentGame && await showPrompt(
		document.body,
		"Continue the game already in progress?",
		[["Continue", true], ["Start a New Game", false]]
	);
	const params = continueGame ? parseParams(currentGame) : {
		gameLength: Number(urlParams.get("time") ?? (6 * 60)),
		grid: (
			urlParams.has("letters")
			? BoggleGrid.fromString(urlParams.get("letters").toLocaleUpperCase())
			: BoggleGrid.fromDice(BigBoggleDice)
		)
	};
	globalThis.localStorage.removeItem("currentGame");
	globalThis.localStorage.removeItem("currentGameTime");
	const startTime = continueGame ? JSON.parse(currentGameTime) : params.gameLength;
	const game = new BoggleGame(params, startTime);
	game.renderGame(document.body, urlParams.has("flat"), continueGame);
}

startGame();

/**
 * Sounds:
 *   https://pixabay.com/sound-effects/ticking-stopwatch-dry-103837/
 *   https://pixabay.com/sound-effects/marimba-lose-250960/
 *   https://pixabay.com/sound-effects/game-level-complete-143022/
 * 
 * Icons:
 *   https://commons.wikimedia.org/wiki/File:Wiktfavicon_en.svg
 *   https://www.flaticon.com/free-icon/games_10775709
 */