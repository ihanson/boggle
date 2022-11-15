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
		const dice = [...Dice];
		BoggleGame.#shuffleArray(dice);
		const letters = dice.map((die) => die[BoggleGame.#randomInt(0, die.length - 1)]);
		const size = Math.sqrt(letters.length);
		this.#letters = [];
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

	renderGame(gameDiv) {
		const boardDiv = document.createElement("div");
		boardDiv.classList.add("board");
		const rows = this.#letters.map(
			(row) => row.map(
				(letter) => [BoggleGame.#letterDiv(letter), letter]
			)
		);
		for (const row of rows) {
			const rowDiv = document.createElement("div");
			for (const [letterDiv] of row) {
				rowDiv.appendChild(letterDiv);
			}
			boardDiv.appendChild(rowDiv);
		}
		gameDiv.appendChild(boardDiv);
	}

	#letters;
}

new BoggleGame().renderGame(document.getElementById("game"));