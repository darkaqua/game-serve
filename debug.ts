import { serve } from 'https://deno.land/std@0.181.0/http/server.ts';
import {
	getCurrentDate,
	getCurrentFilePath,
	BUILD_FOLDER,
} from './src/utils.ts';

export const serveGame = async () => {
	const PORT = 8080;

	const socketList: (WebSocket | undefined)[] = [];

	const sendMessageToClients = (data: any) => {
		const socketClientList = socketList.filter(
			(ws?: WebSocket) => ws && ws?.readyState === ws.OPEN,
		);
		console.log(
			`[${getCurrentDate()}] Sending changes to clients (${
				socketClientList.length
			})`,
		);
		socketClientList.forEach((ws: WebSocket | undefined) => ws?.send(JSON.stringify(data)));
	};

	{
		const command = new Deno.Command(Deno.execPath(), {
			args: [
				'run',
				'-A',
				'--watch=./src',
				getCurrentFilePath('debug-bundler.ts'),
			],
		});
		command.spawn();
	}

	let swapFileMap = {};

	await serve(
		async (request: Request) => {
			if (request.headers.get('upgrade') === 'websocket') {
				const { socket: ws, response } = Deno.upgradeWebSocket(request);
				socketList.push(ws);
				return response;
			}

			const url = new URL(request.url);
			const filepath = url.pathname ? decodeURIComponent(url.pathname) : '';

			switch (filepath) {
				case '/_reloadBundler':
					sendMessageToClients({ type: 'reload' });
					return new Response();
				case '/_hotSwap':
					if(!request.body) break;
					const reader = request.body.getReader();
					let text = '';
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						const decoder = new TextDecoder();
						const chunkText = decoder.decode(value);

						text += chunkText;
					}

					const list = JSON.parse(text);
					for (const { name, mtime, fileData } of list)
						swapFileMap[name + mtime] = fileData;

					sendMessageToClients({
						type: 'hotSwap',
						data: list.map(({ name, mtime, globalReference }: any) => ({
							name,
							mtime,
							globalReference,
						})),
					});
					return new Response();
				default:
					try {
						const path = BUILD_FOLDER + filepath;
						const stat = await Deno.stat(path);
						if (!stat.isFile) throw '';

						const file = await Deno.open(path, {
							read: true,
						});
						return new Response(file?.readable);
					} catch (_) {
						// ignore
					}
			}

			if (filepath.indexOf('/swapFile') === 0) {
				const fileName = filepath.split('/')[2];

				return new Response(swapFileMap[fileName], {
					headers: {
						'content-type': 'application/js',
					},
				});
			}

			const indexFileText = await Deno.readTextFile('build/index.html');

			return new Response(indexFileText, {
				headers: {
					'content-type': 'text/html',
				},
			});
		},
		{ port: PORT },
	);
};
