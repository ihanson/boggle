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

class BoggleGame {
	constructor() {
		this.#grid = new BoggleGrid();
		this.#worker = new WorkerBox(
			async ([BoggleGrid], serial) => {
				const grid = BoggleGrid.deserialize(serial);
				const request = await fetch("https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt");
				if (request.status === 200) {
					const words = (await request.text()).trim().split(/\s+/);
					console.log(`Loaded ${words.length.toLocaleString()} words`);
					return [
						words,
						words.filter((word) => word.length >= 4)
							.filter((word) => grid.makeWord(word))
					];
				} else {
					throw new Error(await request.text());
				}
			}, [BoggleGrid], this.#grid.serialize()
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

	static #letterDiv(letter, flat) {
		const letterDiv = document.createElement("div");
		const innerDiv = document.createElement("div");
		innerDiv.appendChild(document.createTextNode(letter));
		if (flat) {
			const angle = Math.floor(Math.random() * 4) * 90;
			innerDiv.style.transform = `rotate(${angle}deg)`;
		}
		letterDiv.setAttribute("tabindex", "-1");
		letterDiv.setAttribute("role", "gridcell");
		letterDiv.setAttribute("data-letter", letter);
		letterDiv.appendChild(innerDiv);
		return letterDiv;
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
		const params = new URLSearchParams(globalThis.location.search);
		const flat = params.has("flat");
		const gameLength = params.get("time") ?? (6 * 60);
		const boardDiv = document.createElement("div");
		boardDiv.setAttribute("role", "grid");
		boardDiv.classList.add("board");
		if (flat) {
			boardDiv.classList.add("flat");
		}
		const rows = this.#grid.letters.map(
			(row, y) => row.map(
				(letter, x) => BoggleGame.#letterDiv(letter, flat)
			)
		);
		rows[0][0].setAttribute("tabindex", "0");
		const gridHandler = new GridHandler(rows);
		let rotated = false;
		for (const [y, row] of rows.entries()) {
			const rowDiv = document.createElement("div");
			rowDiv.setAttribute("role", "row");
			for (const [x, letterDiv] of row.entries()) {
				rowDiv.appendChild(letterDiv);
				letterDiv.addEventListener(
					"keydown",
					(event) => gridHandler.handleKeyDown(event, x, y, rotated)
				);
			}
			boardDiv.appendChild(rowDiv);
		}
		boardDiv.classList.add("hidden");
		const boardContainer = document.createElement("div");
		boardContainer.classList.add("boardContainer");
		boardContainer.appendChild(boardDiv);
		gameDiv.appendChild(boardContainer);

		const startButton = document.createElement("button");
		startButton.classList.add("timerButton");
		startButton.appendChild(document.createTextNode("Start"));
		const timerButton = document.createElement("button");
		timerButton.classList.add("timerButton");
		const timerDiv = document.createElement("div");
		timerDiv.classList.add("timer");
		const timer = new Timer(gameLength)
			.everySecond((time) => {
				timerDiv.innerText = BoggleGame.#formatTime(time)
			})
			.at(Math.floor(gameLength / 2) + 2, () => {
				new Audio("Resources/warning.mp3").play();
			})
			.at(Math.floor(gameLength / 2), () => {
				boardDiv.classList.add("rotated");
				rows[0][0].setAttribute("tabindex", "-1");
				rows[rows.length - 1][rows[rows.length - 1].length - 1].setAttribute("tabindex", "0");
				rotated = true;
			})
			.onComplete(() => {
				new Audio("Resources/complete.mp3").play();
				timerButton.parentElement.removeChild(timerButton);
				timerDiv.parentElement.removeChild(timerDiv);
				const [wordChecker, wordInput] = this.#wordChecker(rows);
				gameDiv.appendChild(wordChecker);
				flashText("Time!", boardContainer);
				boardDiv.classList.add("finished");
				setTimeout(() => this.#showAllWords(wordInput), 0);
				this.#releaseWaitLock();
			});
		const startTimer = () => {
			timer.start();
			this.#createWakeLock();
			timerButton.innerText = "Pause";
			boardDiv.classList.remove("hidden");
		};
		const pauseTimer = () => {
			timer.stop();
			this.#releaseWaitLock();
			timerButton.innerText = "Resume";
			boardDiv.classList.add("hidden");
		};
		startButton.addEventListener("click", async () => {
			const time = 1000;
			startButton.style.visibility = "hidden";
			for (let count = 3; count > 0; count--) {
				flashText(count.toLocaleString(), boardContainer, time, "200pt");
				await sleep(time);
			}
			await sleep(time * 0.1);
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

	#wordChecker(rows) {
		const MinLength = 4;
		const div = document.createElement("div");
		const textbox = document.createElement("input");
		const result = document.createElement("div");
		result.classList.add("result");
		textbox.setAttribute("placeholder", "Check a word");
		textbox.addEventListener("input", async () => {
			const word = textbox.value.toLocaleUpperCase().replace(/[^A-Z]/g, "");
			const wordPath = this.#grid.makeWord(word);
			const isRealWord = (await this.#allWords).has(word);
			const isLongEnough = word.length >= MinLength;
			result.innerText = "";
			result.classList.remove("valid");
			for (const [y, row] of rows.entries()) {
				for (const [x, letterDiv] of row.entries()) {
					letterDiv.classList.toggle("selected", !!wordPath && wordPath.some(
						([pathX, pathY]) => pathX === x && pathY === y)
					);
				}
			}
			if (!wordPath) {
				if (isRealWord) {
					result.appendChild(document.createTextNode("You cannot make "));
					result.appendChild(BoggleGame.#dictionaryLink(word));
					result.appendChild(document.createTextNode(" with these letters."));
					result.appendChild(BoggleGame.#wikiLink(word));
				} else {
					result.innerText = `You cannot make ${word} with these letters.`;
				}
			} else if (isLongEnough) {
				if (isRealWord) {
					result.appendChild(BoggleGame.#dictionaryLink(word));
					result.appendChild(document.createTextNode(" is a valid word!"));
					result.appendChild(BoggleGame.#wikiLink(word));
					result.classList.add("valid");
				} else {
					result.innerText = `${word} is not a valid word.`;
				}
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
		a.setAttribute("href", `https://scrabble.merriam.com/finder/${encodeURIComponent(word.toLocaleLowerCase())}`);
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

	#grid;
	#worker;
	#allWords;
	#validWords;
	#wakeLock;
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
		this.#handleSecond();
		this.#interval = setInterval(() => {
			this.#time--;
			this.#handleSecond();
		}, 1000);
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
		if (this.#time === 0) {
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
		const script = `(${caller.toString()})(${f.toString()}, [${deps.map((v) => v.toString()).join(",")}]);`;
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

	#worker;
	#promise;
}

function sleep(time) {
	return new Promise((resolve) => setTimeout(() => resolve(), time));
}

function flashText(text, target = document.body, duration = 1000, fontSize = "120pt") {
	const div = document.createElement("div");
	div.classList.add("flash");
	div.style.setProperty("--duration", `${duration / 1000}s`);
	const textDiv = document.createElement("div");
	textDiv.appendChild(document.createTextNode(text));
	textDiv.style.fontSize = fontSize;
	div.appendChild(textDiv);
	target.appendChild(div);
	div.addEventListener("animationend", () => {
		div.parentNode.removeChild(div);
	});
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
			this.#rows[newY][newX].focus();
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