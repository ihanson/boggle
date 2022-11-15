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

const GameLength = 6 * 60;

class BoggleGame {
	constructor() {
		const dice = [...Dice];
		BoggleGame.#shuffleArray(dice);
		const letters = dice.map((die) => die[BoggleGame.#randomInt(0, die.length - 1)]);
		const size = Math.sqrt(letters.length);
		this.#letters = [];
		this.#words = fetch("https://raw.githubusercontent.com/raun/Scrabble/master/words.txt")
			.then((f) => f.text())
			.then((t) => new Set(t.trim().split(/\s+/).filter((word) => word.length >= 4)));
		for (let row = 0; row < size; row++) {
			this.#letters.push(letters.slice(row * size, (row + 1) * size));
		}
	}

	static #shuffleArray(arr) {
		for (let i = 0; i < arr.length; i++) {
			const j = BoggleGame.#randomInt(i, arr.length - 1);
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	static #randomInt(start, end) {
		return Math.floor(Math.random() * (end - start + 1)) + start;
	}

	static #letterDiv(letter) {
		const letterDiv = document.createElement("div");
		letterDiv.appendChild(document.createTextNode(letter));
		return letterDiv;
	}

	static #formatTime(time) {
		return `${
			Math.floor(time / 60).toLocaleString()
		}:${
			(time % 60).toLocaleString().padStart(2, "0")
		}`;
	}

	renderGame(gameDiv) {
		const boardDiv = document.createElement("div");
		boardDiv.classList.add("board");
		const rows = this.#letters.map(
			(row) => row.map(
				(letter) => BoggleGame.#letterDiv(letter)
			)
		);
		for (const row of rows) {
			const rowDiv = document.createElement("div");
			for (const letterDiv of row) {
				rowDiv.appendChild(letterDiv);
			}
			boardDiv.appendChild(rowDiv);
		}
		boardDiv.classList.add("hidden");
		gameDiv.appendChild(boardDiv);

		const timerButton = document.createElement("button");
		timerButton.appendChild(document.createTextNode("Start"));
		const timerDiv = document.createElement("div");
		timerDiv.classList.add("timer");
		const timer = new Timer(GameLength)
			.everySecond((time) => {
				timerDiv.innerText = BoggleGame.#formatTime(time)
			})
			.at(Math.floor(GameLength / 2) + 2, () => {
				new Audio("Sounds/warning.mp3").play();
			})
			.at(Math.floor(GameLength / 2), () => {
				boardDiv.classList.add("rotated");
			})
			.onComplete(() => {
				new Audio("Sounds/complete.mp3").play();
				timerButton.parentElement.removeChild(timerButton);
				timerDiv.parentElement.removeChild(timerDiv);
				const [wordChecker, wordInput] = this.#wordChecker(rows);
				gameDiv.appendChild(wordChecker);
				this.#showAllWords(wordInput);

			});
		timerButton.addEventListener("click", () => {
			if (timer.isRunning()) {
				timer.stop();
				timerButton.innerText = "Resume";
				boardDiv.classList.add("hidden");
			} else {
				timer.start();
				timerButton.innerText = "Pause";
				boardDiv.classList.remove("hidden");
			}
		});
		gameDiv.appendChild(timerButton);
		gameDiv.appendChild(timerDiv);
	}

	#wordChecker(rows) {
		const div = document.createElement("div");
		const textbox = document.createElement("input");
		const result = document.createElement("div");
		result.classList.add("result");
		textbox.setAttribute("placeholder", "Check a word");
		textbox.addEventListener("input", () => {
			const word = textbox.value.toLocaleUpperCase().replace(/[^A-Z]/g, "");
			const wordPath = this.#makeWord(word);
			if (!wordPath) {
				result.innerText = `You cannot make ${word} with these letters.`;
				result.classList.remove("valid");
				for (const row of rows) {
					for (const letterDiv of row) {
						letterDiv.classList.remove("selected");
					}
				}
			} else {
				for (const [y, row] of rows.entries()) {
					for (const [x, letterDiv] of row.entries()) {
						letterDiv.classList.toggle("selected", wordPath.some(
							([pathX, pathY]) => pathX === x && pathY === y)
						);
					}
				}
				if (word.length >= 4) {
					this.#words.then((words) => {
						if (words.has(word)) {
							result.innerText = "";
							const a = document.createElement("a");
							a.setAttribute("href", `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word.toLocaleLowerCase())}`);
							a.setAttribute("target", "_blank");
							a.appendChild(document.createTextNode(word));
							result.appendChild(a);
							result.appendChild(document.createTextNode(" is a valid word!"));
							result.classList.add("valid");
						} else {
							result.innerText = `${word} is not a valid word.`;
							result.classList.remove("valid");
						}
					});
				} else {
					result.innerText = "";
				}
			}
		});
		div.appendChild(textbox);
		div.appendChild(result);
		return [div, textbox];
	}

	#makeWord(word) {
		const wordArr = [...word]
		for (const [rowIndex, row] of this.#letters.entries()) {
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
		const letter = this.#letters[rowIndex][colIndex].toLocaleUpperCase();
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
					if (0 <= y && y < this.#letters.length && 0 <= x && x < this.#letters[y].length) {
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

	async #showAllWords(wordInput) {
		const button = document.createElement("button");
		button.appendChild(document.createTextNode("\xab"));
		button.classList.add("expand");
		button.addEventListener("click", () => {
			button.parentElement.removeChild(button);
			document.getElementById("container").classList.add("showReveal");
		});
		document.getElementById("game").appendChild(button);
		const ul = document.createElement("ul");
		const words = [...await this.#words].filter((word) => this.#makeWord(word));
		words.sort((a, b) => (b.length - a.length) || a.localeCompare(b))
		for (const word of words) {
			const li = document.createElement("li");
			const wordButton = document.createElement("button");
			wordButton.classList.add("word");
			wordButton.appendChild(document.createTextNode(word.toLocaleLowerCase()));
			wordButton.addEventListener("click", () => {
				wordInput.value = word;
				wordInput.dispatchEvent(new Event("input"));
				
			});
			li.appendChild(wordButton);
			ul.appendChild(li);
		}
		document.getElementById("reveal").appendChild(ul);
	}

	#letters;
	#words;
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

new BoggleGame().renderGame(document.getElementById("game"));