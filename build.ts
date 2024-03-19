import { build } from 'https://deno.land/x/deno_web_serve@v2.8.1/mod.ts';
import { load } from 'deno/dotenv/mod.ts';


export const buildGame = async () => {
	const env = await load();
	Object.keys(env).forEach(key => Deno.env.set(key, env[key]));
	
	await build({
		indexFileName: 'main.ts',
		minify: true,
		bundleAssets: true,
		envs: [],
	});
	
}