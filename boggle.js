const Dice = [
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

class BoggleGame {
	constructor() {
		const urlParams = new URLSearchParams(globalThis.location.search);
		this.#params = {
			flat: urlParams.has("flat"),
			gameLength: urlParams.get("time") ?? (6 * 60)
		};
		this.#grid = (
			urlParams.has("letters") && urlParams.get("letters").length === Dice.length
			? new BoggleGrid(BoggleGame.#letterArray(urlParams.get("letters").toLocaleUpperCase()))
			: new BoggleGrid()
		);
		this.#worker = new WorkerBox(
			async ([BoggleGrid, WordListURL], serial) => {
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

	static #letterArray(letters) {
		const rows = [];
		const size = Math.sqrt(letters.length);
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

	static #formatTime(time) {
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

	renderGame(gameDiv) {
		const domGrid = new DOMGrid(this.#grid, this.#params.flat);
		domGrid.renderTo(gameDiv);

		const startButton = document.createElement("button");
		startButton.classList.add("timerButton");
		startButton.appendChild(document.createTextNode("Start"));
		const timerButton = document.createElement("button");
		timerButton.classList.add("timerButton");
		const timerDiv = document.createElement("div");
		timerDiv.classList.add("timer");
		const timer = new Timer(this.#params.gameLength)
			.everySecond((time) => {
				timerDiv.innerText = BoggleGame.#formatTime(time)
			})
			.at(Math.floor(this.#params.gameLength / 2) + 2, () => {
				new Audio("Resources/warning.mp3").play();
			})
			.at(Math.floor(this.#params.gameLength / 2), () => {
				domGrid.setRotated();
			})
			.onComplete(() => {
				new Audio("Resources/complete.mp3").play();
				timerButton.parentElement.removeChild(timerButton);
				timerDiv.parentElement.removeChild(timerDiv);
				const [wordChecker, wordInput] = this.#wordChecker(domGrid);
				gameDiv.appendChild(wordChecker);
				domGrid.flashText("Time!");
				domGrid.setFinished();
				setTimeout(() => this.#showAllWords(wordInput), 0);
				this.#releaseWaitLock();
			});
		const tick = new Audio("Resources/tick.wav");
		for (let second = 1; second <= 10; second++) {
			timer.at(second, () => tick.play());
		}
		const startTimer = () => {
			timer.start();
			this.#createWakeLock();
			timerButton.innerText = "Pause";
			domGrid.showLetters();
		};
		const pauseTimer = () => {
			timer.stop();
			this.#releaseWaitLock();
			timerButton.innerText = "Resume";
			domGrid.hideLetters();
		};
		startButton.addEventListener("click", async () => {
			const time = 1000;
			startButton.style.visibility = "hidden";
			if (this.#params.gameLength > 0) {
				for (let count = 3; count > 0; count--) {
					domGrid.flashText(count.toLocaleString(), time, "200pt");
					await sleep(time);
				}
				await sleep(time * 0.1);
			}
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
		gameDiv.appendChild(startButton);
		gameDiv.appendChild(timerDiv);
	}

	#wordChecker(domGrid) {
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

	async #showAllWords(wordInput) {
		const words = [...await this.#validWords];
		const button = document.createElement("button");
		button.appendChild(document.createTextNode("\xab"));
		button.classList.add("expand");
		button.addEventListener("click", () => {
			button.parentElement.removeChild(button);
			document.getElementById("container").classList.add("showReveal");
		});
		document.getElementById("game").appendChild(button);
		const callback = (word) => {
			wordInput.value = word;
			wordInput.dispatchEvent(new Event("input"));
		};
		const wordsByLength = BoggleGame.#group(words, (word) => word.length);
		const lists = [...wordsByLength.keys()]
			.sort((a, b) => b - a)
			.map((len) => BoggleGame.#wordList(
				[...wordsByLength.get(len)].sort((a, b) => a.localeCompare(b)),
				callback
			));
		for (const list of lists) {
			document.getElementById("reveal").appendChild(list);
		}
	}

	async collinsResult(word, throttle = new Throttle(0)) {
		if (this.#lookupResults.has(word)) {
			return this.#lookupResults.get(word);
		}
		const url = `https://scrabblechecker.collinsdictionary.com/check/api/index.php?key=${encodeURIComponent(word.toLocaleLowerCase())}`;
		return throttle.maybeDoTask(async () => {
			const request = await fetch(url)
			if (request.status !== 200) {
				throw new Error(await request.text());
			}
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

	static #group(list, groupBy) {
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

	static #wordList(words, onClick) {
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

	static #dictionaryLink(word) {
		const a = document.createElement("a");
		a.setAttribute("href", `https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(word.toLocaleLowerCase())}`);
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noreferrer");
		a.appendChild(document.createTextNode(word));
		return a;
	}

	static #wikiLink(word) {
		const a = document.createElement("a");
		a.setAttribute("target", "_blank");
		a.setAttribute("rel", "noreferrer");
		a.setAttribute("href", `https://en.wiktionary.org/w/index.php?search=${encodeURIComponent(word.toLocaleLowerCase())}`);
		a.classList.add("wiki");
		const img = document.createElement("img");
		img.setAttribute("src", "Resources/wiktionary.png");
		img.setAttribute("alt", "Wiktionary");
		img.setAttribute("title", "Wiktionary");
		a.appendChild(img);
		return a;
	}

	static #definitionElement(lookupResult) {
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
			const partsOfSpeech = lookupResult.data.posp.split("###");
			const definitions = lookupResult.data.complete_definition.split("###");
			for (let i = 0; i < definitions.length; i++) {
				const partOfSpeech = partsOfSpeech[i];
				const definition = definitions[i];
				if (partOfSpeech) {
					const header = document.createElement("h1");
					header.appendChild(document.createTextNode(partOfSpeech));
					container.appendChild(header);
				}
				if (definition) {
					const defDiv = document.createElement("div");
					defDiv.appendChild(document.createTextNode(definition));
					container.appendChild(defDiv);
				}
			}
		}
		return container;
	}

	#params;
	#grid;
	#worker;
	#allWords;
	#validWords;
	#lookupResults = new Map();
	#wakeLock;
}

class DOMGrid {
	constructor(grid, flat) {
		this.#boardDiv = document.createElement("div");
		this.#boardDiv.setAttribute("role", "grid");
		this.#boardDiv.classList.add("board");
		if (flat) {
			this.#boardDiv.classList.add("flat");
		}
		this.#rows = grid.letters.map(
			(row) => row.map((letter) => ({
				div: DOMGrid.#letterDiv(flat),
				letter
			}))
		);
		this.#rows[0][0].div.setAttribute("tabindex", "0");
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
	}

	renderTo(target) {
		target.appendChild(this.#boardContainer);
	}

	setRotated() {
		this.#boardDiv.classList.add("rotated");
		this.#rows[0][0].div.setAttribute("tabindex", "-1");
		const lastRow = this.#rows.length - 1;
		const lastCol = this.#rows[lastRow].length -1;
		this.#rows[lastRow][lastCol].div.setAttribute("tabindex", "0");
		this.#rotated = true;
	}

	showLetters() {
		for (const row of this.#rows) {
			for (const {letter, div} of row) {
				div.firstChild.innerText = letter;
			}
		}
	}

	hideLetters() {
		for (const row of this.#rows) {
			for (const {div} of row) {
				div.firstChild.innerText = "";
			}
		}
	}

	selectPath(wordPath) {
		for (const [y, row] of this.#rows.entries()) {
			for (const [x, {div}] of row.entries()) {
				div.classList.toggle("selected", !!wordPath && wordPath.some(
					([pathX, pathY]) => pathX === x && pathY === y)
				);
			}
		}
	}
	
	flashText(text, duration = 1000, fontSize = "120pt") {
		const div = document.createElement("div");
		div.classList.add("flash");
		div.style.setProperty("--duration", `${duration / 1000}s`);
		const textDiv = document.createElement("div");
		textDiv.appendChild(document.createTextNode(text));
		textDiv.style.fontSize = fontSize;
		div.appendChild(textDiv);
		this.#boardContainer.appendChild(div);
		div.addEventListener("animationend", () => {
			div.parentNode.removeChild(div);
		});
	}

	setFinished() {
		this.#boardDiv.classList.add("finished");
	}

	static #letterDiv(flat) {
		const letterDiv = document.createElement("div");
		const innerDiv = document.createElement("div");
		if (flat) {
			const angle = Math.floor(Math.random() * 4) * 90;
			innerDiv.style.transform = `rotate(${angle}deg)`;
		}
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
	constructor(letters) {
		this.letters = letters ?? BoggleGrid.#randomLetters();
	}

	serialize() {
		return JSON.stringify(this.letters);
	}

	static deserialize(serial) {
		return new BoggleGrid(JSON.parse(serial));
	}

	static #randomLetters() {
		const dice = [...Dice];
		BoggleGrid.#shuffleArray(dice);
		const letters = dice.map((die) => die[BoggleGrid.#randomInt(0, die.length - 1)]);
		const rows = [];
		const size = Math.sqrt(letters.length);
		for (let row = 0; row < size; row++) {
			rows.push(letters.slice(row * size, (row + 1) * size));
		}
		return rows;
	}

	static #shuffleArray(arr) {
		for (let i = 0; i < arr.length; i++) {
			const j = BoggleGrid.#randomInt(i, arr.length - 1);
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	static #randomInt(start, end) {
		return Math.floor(Math.random() * (end - start + 1)) + start;
	}

	makeWord(word) {
		const wordArr = [...word]
		for (const [rowIndex, row] of this.letters.entries()) {
			for (const [colIndex, letter] of row.entries()) {
				const result = this.#makeWordHelper(wordArr, colIndex, rowIndex, []);
				if (result) {
					return result;
				}
			}
		}
		return null;
	}

	#makeWordHelper(word, colIndex, rowIndex, seen) {
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
	constructor(seconds) {
		this.#time = seconds;
		this.#everySecond = [];
		this.#at = new Map();
		this.#onComplete = [];
	}

	everySecond(callback) {
		this.#everySecond.push(callback);
		return this;
	}

	at(time, callback) {
		if (!this.#at.has(time)) {
			this.#at.set(time, []);
		}
		this.#at.get(time).push(callback);
		return this;
	}

	onComplete(callback) {
		this.#onComplete.push(callback);
		return this;
	}

	isRunning() {
		return !!this.#interval;
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

	#handleSecond() {
		for (const callback of this.#everySecond) {
			callback.call(null, this.#time);
		}
		for (const callback of this.#at.get(this.#time) ?? []) {
			callback.call(null);
		}
		if (this.#time <= 0) {
			for (const callback of this.#onComplete) {
				callback.call(null);
			}
			this.stop();
		}
	}

	#time
	#everySecond
	#at
	#onComplete
	#interval
}

class Throttle {
	constructor(milliseconds) {
		this.#milliseconds = milliseconds;
	}

	maybeDoTask(task) {
		const now = performance.now();
		if (this.#currentTimeout !== null) {
			clearTimeout(this.#currentTimeout);
			this.#currentTimeout = null;
		}
		const waitTime = this.#lastEventTime === null
			? 0
			: Math.max(this.#milliseconds - (now - this.#lastEventTime), 0);
		let resolve;
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
	#currentTimeout = null;
	#lastEventTime = null;
}

class WorkerBox {
	constructor(f, deps, data) {
		const caller = (f, deps) => {
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
		this.#promise = new Promise((resolve, reject) => {
			this.#worker.addEventListener("message", ({data}) => {
				if (data.success) {
					resolve(data.success);
				} else {
					reject(data.error);
				}
			});
			this.#worker.postMessage(data);
		});
	}

	promise() {
		return this.#promise;
	}

	static #stringify(object) {
		return (
			object instanceof Function
				? object.toString()
				: JSON.stringify(object)
		);
	}

	#worker;
	#promise;
}

function sleep(time) {
	return new Promise((resolve) => setTimeout(() => resolve(), time));
}

class GridHandler {
	constructor(rows) {
		this.#rows = rows;
	}

	handleKeyDown(event, x, y, rotated) {
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

	static #reverseKey(key) {
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

	static #nextCell(key, ctrl, x, y, numRows, numCols) {
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

new BoggleGame().renderGame(document.getElementById("game"));

/**
 * Sounds:
 *   https://pixabay.com/sound-effects/ticking-stopwatch-dry-103837/
 *   https://pixabay.com/sound-effects/marimba-lose-250960/
 *   https://pixabay.com/sound-effects/game-level-complete-143022/
 */