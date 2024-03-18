const connect = () => {
	const hotSwapSystemNameMap = {};

	function handleMessage(ws, rawData) {
		const { type, data } = JSON.parse(rawData);
		switch (type) {
			case 'reload':
				window.location.reload();
				break;
			case 'hotSwap':
				for (const { name, mtime, globalReference } of data) {
					const script = document.createElement('script');
					script.src = `http://localhost:8080/swapFile/${name}${mtime}`; // replace with your script path
					document.body.appendChild(script);

					console.log('Hot Swap -> ', name);
					let intervalId = setInterval(() => {
						if (typeof eval(globalReference) !== 'undefined') {
							clearInterval(intervalId);

							const system = window.__debug__.engine.__debug__.getSystem(name);
							window.__debug__.engine.__debug__.swapSystem(
								system.id,
								eval(globalReference),
							);
						}
					}, 1);
				}

				break;
		}
	}
	console.debug('Connecting to Local development server...');

	const retry = () => setTimeout(() => connect(), 100);

	try {
		let ws = new WebSocket(`ws://${window.location.host}`);
		ws.onmessage = m => handleMessage(ws, m.data);
		ws.onopen = () => {
			console.debug('Connected to Local development server!');
		};
		ws.onclose = () => retry();
	} catch (err) {
		retry();
	}
};

connect();
