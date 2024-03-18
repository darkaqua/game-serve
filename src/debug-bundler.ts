import esbuild from 'npm:esbuild@0.17.0';
import { ScssModulesPlugin } from 'npm:esbuild-scss-modules-plugin@1.1.1';
import svgrPlugin from 'npm:esbuild-plugin-svgr@1.1.0';
import {
	BUILD_FOLDER,
	copyDirRecursive,
	getFileList,
	getObjectComparison,
	PUBLIC_FOLDER,
} from './utils.ts';
import dayjs from 'npm:dayjs@1.11.9';

const getPrintableDatetime = () => dayjs().format('HH:mm:ss');

const startDatetime = Date.now();
const warningList: string[] = [];
const errorList: string[] = [];
const printConsole = (
	text: string,
	warning: boolean = false,
	error: boolean = false,
) => {
	const currentMs = Date.now() - startDatetime;
	if (error) errorList.push(text);
	else if (warning) warningList.push(text);
	console.log(
		`DWS - ${getPrintableDatetime()} - [`,
		currentMs,
		`ms ] ->`,
		warning ? `WARNING(${text})` : text,
	);
};
const printDone = () => {
	const currentMs = Date.now() - startDatetime;
	// if(!errorList.length)
	//   console.clear()

	const thingsList = [...warningList, ...errorList];
	console.log(
		`DWS - ${getPrintableDatetime()} - [`,
		currentMs,
		`ms ] ->`,
		'💾 Bundled',
		thingsList.length === 0 ? `!` : `with the next warnings:`,
	);
	thingsList.forEach(text => console.error('-', text));
};

printConsole('Start bundling!');

const _getLAstMFilesData = () =>
	new Promise(resolve =>
		Deno.readTextFile(mFilesPath)
			.then(resolve)
			.catch(() => resolve('{}')),
	);

printConsole('Check files cache!');
const getSystemRegex = () => new RegExp(/.*\.system\.ts/);

const mFilesPath = BUILD_FOLDER + '/mfiles.json';
const lastMFilesData = JSON.parse(await _getLAstMFilesData());
const mFilesData = await getFileList();

// Get added / modified / removed
const { modifiedValues, addedKeys, deletedKeys } = getObjectComparison(
	lastMFilesData,
	mFilesData,
);

const modifiedValuesLength = Object.keys(modifiedValues).length;

printConsole(`- Added files (${addedKeys.length})`);
printConsole(`- Deleted files (${deletedKeys.length})`);
printConsole(`- Modified files (${modifiedValuesLength})`);

await Deno.writeTextFile(mFilesPath, JSON.stringify(mFilesData));

const modifiedSystemList = Object.keys(modifiedValues).filter(name =>
	getSystemRegex().exec(name),
);

const isTimeToReload =
	addedKeys.length > 0 ||
	deletedKeys.length > 0 ||
	modifiedSystemList.length === 0 ||
	modifiedValuesLength !== modifiedSystemList.length;

printConsole(
	isTimeToReload
		? '💾 Bundler needs to be reloaded!'
		: '🔥 Hot swapping in progress!',
);

if (!isTimeToReload) {
	const getSystemName = systemPath =>
		systemPath
			.split('/')
			.pop()
			.split('.')[0]
			.replace(/^\//, '') // Remove leading slash
			.replace(/\./g, ' ') // Replace dots with spaces
			.split('-') // Split on hyphens
			.map(
				(word, index) =>
					index === 0 ? word : word[0].toUpperCase() + word.slice(1), // Capitalize words after hyphens
			)
			.join('') // Join words together
			.replace(/\s/g, '') + 'System'; // Remove spaces

	// systems

	const systemList = [];
	for await (const systemPathName of modifiedSystemList) {
		// const systemContent = Deno.readTextFileSync(systemPathName);

		const name = getSystemName(systemPathName);
		const mtime = modifiedValues[systemPathName]['new'];
		const globalReference = `window.__debug__.${name}_${mtime}`;

		const bundleText = await esbuild.build({
			entryPoints: [systemPathName],
			bundle: true,
			write: false,
			outfile: undefined,
			minify: false,
		});
		const fileData = bundleText.outputFiles[0].text
			.replaceAll(`[${name}`, `[${globalReference}`)
			.replaceAll(` ${name}`, ` ${globalReference}`)
			.replaceAll(`var ${globalReference}`, globalReference)
			.replaceAll('Engine.', 'window.__debug__.engine.')
			.replaceAll('System[', 'window.__debug__.system[')
			.replaceAll('Utils[', 'window.__debug__.utils[')
			//This fixes the Howler singletone... why is a fucking single tone? I don't fucking know :(
			.replaceAll('__toESM(require_howler())', '__toESM({})');

		systemList.push({
			name,
			mtime,
			globalReference,
			fileData,
		});
	}

	printConsole(
		`🔥 HCalling bundler process for hot swapping connected clients`,
	);
	try {
		await (
			await fetch(`http://localhost:8080/_hotSwap`, {
				method: 'post',
				body: JSON.stringify(systemList),
			})
		).text();
	} catch (e) {
		console.log(e);
		printConsole(
			`🔥 HImpossible to call bundler process for swapping connected clients`,
			true,
		);
	}
}
try {
	try {
		printConsole('💾 Checking if build folder already exists');
		await Deno.stat(`./${BUILD_FOLDER}`);
	} catch (e) {
		printConsole('💾 Trying to create the build folder');
		await Deno.mkdir(`./${BUILD_FOLDER}`);
	}
} catch (e) {
	printConsole('💾 Impossible to create the build folder', true);
}

let developmentHotRefresh;
try {
	printConsole('💾 Reading debug-hot-refresh file from local');
	developmentHotRefresh = await (
		await fetch(
			import.meta.url.replace('debug-bundler.ts', 'debug-hot-refresh.js'),
		)
	).text();
} catch (e) {
	printConsole('💾 Impossible to read debug-hot-refresh file from local', true);
}

let indexFileText;
try {
	printConsole('💾 Reading index.html from public folder');
	indexFileText = await Deno.readTextFile(`./${PUBLIC_FOLDER}index.html`);
} catch (e) {
	printConsole('💾 Impossible to read index.html from public folder', true);
}

try {
	let cssData = '';
	printConsole(`💾 Bundling main.ts from src folder`);

	const bundlePlugins = [
		ScssModulesPlugin({
			inject: false,
			minify: false,
			cssCallback: css => (cssData += css),
		}),
		svgrPlugin(),
	].filter(Boolean);

	const bundleText = await esbuild.build({
		entryPoints: [`./src/main.ts`],
		bundle: true,
		write: false,
		outfile: undefined,
		minify: false,
		plugins: bundlePlugins as any,
	});
	printConsole(`💾 Bundling complete!`);

	let bundle = bundleText.outputFiles[0].text;

	indexFileText = indexFileText.replace(
		/<!-- SCRIPT_ENVS -->/,
		`<script type="text/javascript">
			window.__debug__ = {};
      window.__env__ = { "ENVIRONMENT": "DEVELOPMENT" }
    </script>`,
	);

	indexFileText = indexFileText.replace(
		/<!-- SCRIPT_BUNDLE -->/,
		`<script type="text/javascript" src="/bundle.js"></script>`,
	);
	Deno.writeTextFileSync(`./${BUILD_FOLDER}/bundle.js`, bundle);
	if (cssData) {
		printConsole(`💾 Writing styles.css file to the build folder`);
		Deno.writeTextFileSync(`./${BUILD_FOLDER}/styles.css`, cssData);
	}

	indexFileText = indexFileText.replace(
		/<!-- SCRIPT_FOOTER -->/,
		`<script type="text/javascript">\n${developmentHotRefresh}</script>`,
	);
} catch (e) {
	console.log(e);
	printConsole(
		`💾 Something went extremely wrong during the bundler process!`,
		false,
		true,
	);
}

try {
	const assetsDir = `./${PUBLIC_FOLDER}assets`;
	const buildAssetsDir = `./${BUILD_FOLDER}/assets`;

	printConsole(
		`💾 Copying assets public folder to the build folder recursively`,
	);
	await copyDirRecursive(assetsDir, buildAssetsDir);
} catch (err) {
	printConsole(`💾 Something went extremely wrong with the assets!`, true);
}

try {
	printConsole(`💾 Writing index.html file to the build folder`);
	Deno.writeTextFileSync(`./${BUILD_FOLDER}/index.html`, indexFileText);
} catch (e) {
	printConsole(
		`💾 Impossible to write index.html file to the build folder`,
		true,
	);
}

if (isTimeToReload) {
	printConsole(`💾 Calling bundler process for hot reload connected clients`);
	try {
		await (await fetch(`http://localhost:8080/_reloadBundler`)).text();
	} catch (e) {
		printConsole(
			`💾 Impossible to call bundler process for hot reload connected clients`,
			true,
		);
	}
}

printDone();
