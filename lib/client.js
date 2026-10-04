/**
 * gateway-config — browser half.
 *
 * Registers a localized LLM gateway settings section for fixed OpenAI-
 * compatible presets plus pi-ai's native openai-codex OAuth provider. The panel is a
 * three-step wizard: (1) gateway & credentials, (2) model discovery with
 * checkbox selection, (3) review & import. Per-model capabilities
 * (reasoning efforts, input modalities) are derived automatically per model
 * family and shown in the model list. A stored key for the current route is
 * reused: discoverModels inherits it via the existing provider route, so
 * refreshing the model list does not require pasting the key again. Uses the
 * shipped client API surface (api.llm.discoverModels / api.settings.describe
 * / api.settings.mutate / api.credentials.describe / api.credentials.set)
 * and the primitives Button/Input components with dsw theme tokens.
 */
window.__ModuleLoader__.load({
	id: "gateway-config",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let React = require("react");
		let { Button, Input } = require("@deepseek-ai/dsh-client-ui-primitives");

		const DEFAULT_BASE_URL = "";
		const SETTINGS_NS = "llm-pi-ai";
		const DONE_STEP = 4;
		const zh = {
			section: { label: "LLM 网关配置", title: "LLM 网关配置 · 第 {step} 步 / 共 3 步", doneTitle: "LLM 网关配置 · 导入完成" },
			steps: { auth: "网关与认证", models: "选择模型", import: "导入" },
			common: { unknown: "未知错误", cancel: "取消", choose: "请选择", submit: "提交", previous: "上一步", next: "下一步" },
			oauth: {
				title: "使用 ChatGPT OAuth 登录", signedIn: "✓ 已通过 ChatGPT OAuth 登录",
				description: "DSH 将授权信息安全存入 llm-pi-ai 凭据记录，access token 到期后由 pi-ai 自动刷新；不会读取 Codex CLI 的 auth.json。",
				signIn: "登录 ChatGPT", signInAgain: "重新登录", waiting: "等待授权…", unsupported: "当前 DSH 版本不包含 openai-codex OAuth flow；需要 DSH 0.1.1-rc.1 或更新版本。",
				continue: "请在浏览器中继续授权。", openPage: "打开授权页面", failed: "OAuth 登录失败",
				statusError: "读取 OAuth 状态失败：{error}", beginError: "启动 OAuth 失败：{error}", answerError: "提交授权信息失败：{error}",
				savedGrant: "OAuth grant 已由 DSH 安全存储并自动刷新",
			},
			field: { apiKey: "API key", apiKeySaved: "API key（{ref} 已保存，可留空继续用）", apiKeyReuse: "留空则沿用已保存的 key", baseUrl: "Base URL（已配置的 provider 会自动回填）", provider: "Provider（已支持的网关）", displayName: "Provider 显示名称（可选）" },
			error: {
				needBaseUrl: "请先填写 Base URL（OpenAI 兼容、支持 /models 查询的网关地址）。", fetch: "拉取失败：{error}", writeConfig: "写入配置失败：{error}", storeKey: "存储 key 失败：{error}", write: "写入失败：{error}",
				noKey: "还没有可用的 API key：请返回第一步输入一次，或确认该 route 已保存 {ref}。", nextBaseUrl: "请先填写 Base URL 再进入下一步。", nextAuth: "请先完成认证（已保存过 API key 可留空）。", fetchFirst: "请先拉取模型列表。", selectModel: "请至少勾选一个模型。",
			},
			model: { capability: "{input} · 档位 {efforts}", textImage: "文+图", text: "文本", fetched: "拉取到 {total} 个模型，过滤掉 {filtered} 个非聊天模型。请勾选要写入的模型；输入模态与推理档位已按模型家族自动录入。", fetching: "拉取中…", fetch: "拉取模型", list: "模型列表（勾选后写入，共 {selected}/{total} 个；● 标记默认模型）", none: "全不选", all: "全选", defaultTitle: "设为默认模型", hint: "点击「拉取模型」获取聊天模型列表；非聊天模型（图像/视频/嵌入/语音等）会自动过滤。", effort: "默认推理强度" },
			result: { success: "导入成功：{name}（{route}）", detail: "写入 {count} 个模型{skipped}{filtered}；{credential}{defaultModel}", skipped: "，跳过 {count} 个未勾选", filtered: "，过滤 {count} 个非聊天模型", default: "；默认模型：{model}", again: "返回继续导入", reuseKey: "沿用已保存的 {ref}", storedKey: "key 存入 {ref}", defaultSaved: "，默认模型已切换" },
			summary: { auth: "认证", oauth: "ChatGPT OAuth（自动刷新）", keyUpdate: "已保存，将更新为新填入的 key", keyReuse: "已保存，沿用", keyStore: "将存入 {ref}", notProvided: "未提供", models: "写入模型", modelsValue: "{count} 个：{shown}{more}", more: " 等 {count} 个", filtered: "过滤模型", filteredValue: "{count} 个非聊天模型", defaultModel: "默认模型", effort: "{model} · 档位 {effort}", notSelected: "未选择", cleanup: " 清理现有 openai provider（模型 id 含空格，无效）" },
			import: { importing: "导入中…", action: "导入配置" },
		};
		const en = {
			section: { label: "LLM Gateway", title: "LLM Gateway · Step {step} of 3", doneTitle: "LLM Gateway · Import complete" },
			steps: { auth: "Gateway & auth", models: "Select models", import: "Import" },
			common: { unknown: "Unknown error", cancel: "Cancel", choose: "Choose…", submit: "Submit", previous: "Previous", next: "Next" },
			oauth: { title: "Sign in with ChatGPT OAuth", signedIn: "✓ Signed in with ChatGPT OAuth", description: "DSH securely stores the grant in llm-pi-ai and pi-ai refreshes expired access tokens. Codex CLI auth.json is not read.", signIn: "Sign in to ChatGPT", signInAgain: "Sign in again", waiting: "Waiting for authorization…", unsupported: "This DSH version does not include the openai-codex OAuth flow. DSH 0.1.1-rc.1 or newer is required.", continue: "Continue authorization in your browser.", openPage: "Open authorization page", failed: "OAuth sign-in failed", statusError: "Could not read OAuth status: {error}", beginError: "Could not start OAuth: {error}", answerError: "Could not submit authorization data: {error}", savedGrant: "OAuth grant is securely stored by DSH and refreshed automatically" },
			field: { apiKey: "API key", apiKeySaved: "API key ({ref} is saved; leave blank to reuse)", apiKeyReuse: "Leave blank to reuse the saved key", baseUrl: "Base URL (saved provider URLs are filled automatically)", provider: "Provider (supported gateways)", displayName: "Provider display name (optional)" },
			error: { needBaseUrl: "Enter an OpenAI-compatible Base URL that supports /models.", fetch: "Model discovery failed: {error}", writeConfig: "Could not write configuration: {error}", storeKey: "Could not store key: {error}", write: "Import failed: {error}", noKey: "No API key is available. Enter one in step one or confirm that {ref} is saved.", nextBaseUrl: "Enter a Base URL before continuing.", nextAuth: "Complete authentication first (a previously saved API key may be left blank).", fetchFirst: "Discover the model list first.", selectModel: "Select at least one model." },
			model: { capability: "{input} · efforts {efforts}", textImage: "text+image", text: "text", fetched: "Found {total} models and filtered {filtered} non-chat models. Select the models to import; input modes and reasoning efforts are derived by model family.", fetching: "Discovering…", fetch: "Discover models", list: "Models to import: {selected}/{total} (● marks the default)", none: "Select none", all: "Select all", defaultTitle: "Set as default model", hint: "Discover the gateway's chat models; image, video, embedding, and audio models are filtered automatically.", effort: "Default reasoning effort" },
			result: { success: "Imported {name} ({route})", detail: "Imported {count} models{skipped}{filtered}; {credential}{defaultModel}", skipped: ", skipped {count} unselected", filtered: ", filtered {count} non-chat", default: "; default model: {model}", again: "Import another gateway", reuseKey: "Reused saved {ref}", storedKey: "Stored key in {ref}", defaultSaved: ", default model updated" },
			summary: { auth: "Authentication", oauth: "ChatGPT OAuth (automatic refresh)", keyUpdate: "saved; will update with the new key", keyReuse: "saved; will reuse", keyStore: "Will store in {ref}", notProvided: "Not provided", models: "Models", modelsValue: "{count}: {shown}{more}", more: " and {count} total", filtered: "Filtered", filteredValue: "{count} non-chat models", defaultModel: "Default model", effort: "{model} · effort {effort}", notSelected: "Not selected", cleanup: " Remove the invalid existing openai provider (model IDs contain spaces)" },
			import: { importing: "Importing…", action: "Import configuration" },
		};
		function flattenDictionary(source, prefix, target) {
			const output = target || {};
			Object.entries(source).forEach(([key, value]) => {
				const path = prefix ? prefix + "." + key : key;
				if (value && typeof value === "object") flattenDictionary(value, path, output);
				else output[path] = value;
			});
			return output;
		}

		/** Fixed provider presets — must mirror the host half. */
		const PRESETS = [
			{ route: "cindy", displayName: "Cindy" },
			{ route: "sub2api", displayName: "Sub2API" },
			{ route: "generic", displayName: "Generic" },
			{ route: "deepseek", displayName: "DeepSeek", baseURL: "https://api.deepseek.com/v1" },
			{ route: "moonshot", displayName: "Kimi", baseURL: "https://api.moonshot.cn/v1" },
			{ route: "zhipu", displayName: "Zhipu GLM", baseURL: "https://open.bigmodel.cn/api/paas/v4" },
			{ route: "qwen", displayName: "Qwen", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
			{ route: "openrouter", displayName: "OpenRouter", baseURL: "https://openrouter.ai/api/v1" },
			{ route: "siliconflow", displayName: "SiliconFlow", baseURL: "https://api.siliconflow.cn/v1" },
			{ route: "xai", displayName: "xAI Grok", baseURL: "https://api.x.ai/v1" },
			{ route: "openai-codex", displayName: "OpenAI Codex (ChatGPT)", oauth: true },
		];

		function deriveKeyRef(route) {
			return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
		}

		/** Same filter as the host half: keep only chat-capable models. */
		const NON_CHAT_PATTERN = /(^|[/_.-])(image|img|embedding|embed|voyage|seedream|seedance|happyhorse|t2v|i2v|r2v|video|realtime|asr|whisper|tts|speech|audio|doc)([/_.-]|$)/i;
		const DEEPSEEK_PATTERN = /(^|[/_.-])deepseek([/_.-]|$)/i;
		const GPT56_PATTERN = /(^|[/_.-])gpt-5\.6([/_.:-]|$)/i;
		const GPT54_55_PATTERN = /(^|[/_.-])gpt-5\.(4|5)([/_.:-]|$)/i;
		const GEMINI_FLASH_PATTERN = /(^|[/_.-])(gemini-.*flash|omni-flash)([/_.-]|$)/i;
		const GEMINI_PRO_PATTERN = /(^|[/_.-])gemini-.*pro([/_.-]|$)/i;
		const IMAGE_INPUT_PATTERN = /(^|[/_.-])(gpt-5\.(4|5|6)|grok-4\.[5-9]|gemini-(?!.*image)|omni-flash)([/_.:-]|$)/i;

		function inputFor(model) {
			const declared = model && (model.input || model.inputModalities || model.modalities);
			if (Array.isArray(declared) && declared.length > 0) return declared.includes("image") ? ["text", "image"] : ["text"];
			if (model && (model.supportsImages === true || model.imageInput === true)) return ["text", "image"];
			return IMAGE_INPUT_PATTERN.test(String((model && model.id) || "")) ? ["text", "image"] : ["text"];
		}
		function isChatModel(modelId) {
			return !NON_CHAT_PATTERN.test(modelId);
		}
		function reasoningFor(modelId) {
			if (DEEPSEEK_PATTERN.test(modelId)) return { off: null, high: "high", max: "max" };
			if (GPT56_PATTERN.test(modelId)) return { off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" };
			if (GPT54_55_PATTERN.test(modelId)) return { off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh" };
			if (GEMINI_FLASH_PATTERN.test(modelId)) return { off: null, high: "high" };
			if (GEMINI_PRO_PATTERN.test(modelId)) return { low: "low", high: "high" };
			return { off: null, low: "low", medium: "medium", high: "high" };
		}
		function compatFor(modelId) {
			return DEEPSEEK_PATTERN.test(modelId) ? { thinkingFormat: "deepseek" } : { thinkingFormat: "openai" };
		}
		function effortChoices(modelId) {
			return Object.keys(reasoningFor(modelId));
		}
		function capabilityNote(model, t) {
			const input = inputFor(model);
			return t("model.capability", { input: t(input.includes("image") ? "model.textImage" : "model.text"), efforts: effortChoices(model.id).join("/") });
		}

		const fieldStyle = { display: "block", margin: "10px 0 0" };
		const labelStyle = {
			display: "block", margin: "0 0 4px", fontSize: 12, fontWeight: 500,
			color: "var(--dsw-alias-label-secondary)", lineHeight: "18px",
		};
		const selectStyle = {
			boxSizing: "border-box", border: "1px solid var(--dsw-alias-border-l2)",
			width: "100%", height: 32, font: "inherit", borderRadius: 8, padding: "0 10px",
			fontSize: 14, lineHeight: "22px", cursor: "pointer", maxWidth: 360,
			background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
		};
		const statusStyle = (kind) => ({
			margin: "12px 0 0", padding: "10px 12px", fontSize: 13, lineHeight: "20px",
			borderRadius: 8,
			border: kind === "error"
				? "1px solid var(--dsw-alias-state-error-primary)"
				: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-module-platform)",
			color: kind === "error"
				? "var(--dsw-alias-state-error-primary)"
				: "var(--dsw-alias-label-primary)",
			whiteSpace: "pre-wrap", wordBreak: "break-all",
		});
		const summaryRow = (label, value) => React.createElement("div", {
			style: { display: "flex", gap: 8, fontSize: 13, lineHeight: "22px", margin: "2px 0" },
		},
			React.createElement("span", { style: { minWidth: 96, color: "var(--dsw-alias-label-secondary)" } }, label),
			React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" } }, value),
		);

		function GatewaySection(props) {
			const api = props && props.api;
			const oauthRemote = props && props.oauthRemote;
			const t = props && props.t;
			if (api === void 0 || oauthRemote === void 0 || t === void 0) return null;
			const STEPS = [t("steps.auth"), t("steps.models"), t("steps.import")];
			const [step, setStep] = React.useState(1);
			const [baseURL, setBaseURL] = React.useState(DEFAULT_BASE_URL);
			const [apiKey, setApiKey] = React.useState("");
			const [route, setRoute] = React.useState(PRESETS[0].route);
			const [displayName, setDisplayName] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [storedKey, setStoredKey] = React.useState(false);
			const [models, setModels] = React.useState([]);
			const [included, setIncluded] = React.useState({});
			const [filtered, setFiltered] = React.useState(0);
			const [defaultModel, setDefaultModel] = React.useState("");
			const [effort, setEffort] = React.useState("off");
			const [cleanup, setCleanup] = React.useState(true);
			const [message, setMessage] = React.useState(null);
			const [result, setResult] = React.useState(null);
			const [oauth, setOauth] = React.useState({ supported: false, configured: false, attempt: { state: "idle" } });
			const [oauthAnswer, setOauthAnswer] = React.useState("");
			const oauthPopup = React.useRef(null);
			const openedOauthURL = React.useRef("");

			const typedKey = apiKey.trim();
			const preset = PRESETS.find((p) => p.route === route);
			const isOAuth = Boolean(preset && preset.oauth);
			const hasAuth = isOAuth ? oauth.configured : typedKey.length > 0 || storedKey;
			const known = preset;
			const selectedModels = models.filter((m) => included[m.id]);

			const toggleModel = (id, checked) => {
				setIncluded((prev) => {
					const next = { ...prev, [id]: checked };
					if (!checked && defaultModel === id) {
						const fallback = models.find((m) => next[m.id]);
						setDefaultModel(fallback ? fallback.id : "");
					}
					return next;
				});
			};

			const setAllModels = (checked) => {
				const next = {};
				models.forEach((m) => { next[m.id] = checked; });
				setIncluded(next);
				if (!checked) {
					setDefaultModel("");
				} else if (!next[defaultModel]) {
					const preferred = models.find((m) => /deepseek/i.test(m.id)) || models[0];
					setDefaultModel(preferred ? preferred.id : "");
					setEffort(preferred ? effortChoices(preferred.id)[0] : "off");
				}
			};

			const bulkButton = (label, onClick) => React.createElement("button", {
				type: "button",
				onClick,
				style: {
					border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6,
					background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)",
					font: "inherit", fontSize: 12, lineHeight: "18px", padding: "2px 10px", cursor: "pointer",
				},
			}, label);

			// Key presence for the effective route (reused instead of re-pasting).
			React.useEffect(() => {
				if (!isOAuth) {
					setOauth({ supported: false, configured: false, attempt: { state: "idle" } });
					return undefined;
				}
				let cancelled = false;
				const refresh = async () => {
					try {
						const response = await oauthRemote.status(route);
						if (!cancelled && response && response.ok) setOauth(response.value);
						else if (!cancelled && response && response.error) setMessage({ kind: "error", text: t("oauth.statusError", { error: response.error.message }) });
					} catch (error) {
						if (!cancelled) setMessage({ kind: "error", text: t("oauth.statusError", { error: String((error && error.message) || error) }) });
					}
				};
				void refresh();
				const timer = setInterval(refresh, 750);
				return () => { cancelled = true; clearInterval(timer); };
			}, [isOAuth, oauthRemote, route, t]);

			React.useEffect(() => {
				const url = oauth && oauth.attempt && oauth.attempt.notice && oauth.attempt.notice.url;
				if (!url || openedOauthURL.current === url) return;
				openedOauthURL.current = url;
				try {
					if (oauthPopup.current && !oauthPopup.current.closed) oauthPopup.current.location.href = url;
				} catch (_e) { /* the visible link below remains available */ }
			}, [oauth]);

			const beginOauth = async () => {
				if (busy || !isOAuth) return;
				setBusy(true);
				setMessage(null);
				openedOauthURL.current = "";
				oauthPopup.current = null;
				try {
					const response = await oauthRemote.begin(route, "oauth");
					if (!response || !response.ok) {
						setMessage({ kind: "error", text: t("oauth.beginError", { error: (response && response.error && response.error.message) || t("common.unknown") }) });
						return;
					}
					setOauth(response.value);
				} catch (error) {
					setMessage({ kind: "error", text: t("oauth.beginError", { error: String((error && error.message) || error) }) });
				} finally {
					setBusy(false);
				}
			};

			const answerOauth = async () => {
				const prompt = oauth && oauth.attempt && oauth.attempt.prompt;
				if (!prompt || !oauthAnswer.trim()) return;
				// The native flow asks for a login method before it emits an auth URL.
				// Open the popup from the Browser-login submit gesture so it is neither
				// premature nor blocked; device-code login stays entirely in the panel.
				if (prompt.kind === "select" && oauthAnswer.trim() === "browser") {
					openedOauthURL.current = "";
					try { oauthPopup.current = window.open("about:blank", "dsh-gateway-oauth", "popup,width=620,height=760"); }
					catch (_e) { oauthPopup.current = null; }
				}
				const response = await oauthRemote.answer(route, prompt.id, oauthAnswer.trim());
				if (response && response.ok) {
					setOauthAnswer("");
					setOauth(response.value);
				} else setMessage({ kind: "error", text: t("oauth.answerError", { error: (response && response.error && response.error.message) || t("common.unknown") }) });
			};

			const cancelOauth = async () => {
				const response = await oauthRemote.cancel(route);
				if (response && response.ok) setOauth(response.value);
				try {
					if (oauthPopup.current && !oauthPopup.current.closed && !openedOauthURL.current) oauthPopup.current.close();
				} catch (_e) { /* popup cleanup is best-effort */ }
				oauthPopup.current = null;
			};

			React.useEffect(() => {
				let cancelled = false;
				const ref = deriveKeyRef(route);
				if (isOAuth) {
					setStoredKey(false);
					return () => { cancelled = true; };
				}
				api.credentials.describe([ref]).then((response) => {
					if (cancelled) return;
					const views = response && response.ok
						? (response.value || {})
						: {};
					const hit = views[ref];
					setStoredKey(Boolean(hit && hit.configured));
				}).catch(() => {
					if (!cancelled) setStoredKey(false);
				});
				return () => { cancelled = true; };
			}, [api, isOAuth, route]);

			// Per-route memory of each gateway's address: localStorage first,
			// then the provider profiles saved in llm-pi-ai settings (baseURL
			// is not a secret, so it rides the redacted describe view).
			const [knownURLs, setKnownURLs] = React.useState(() => {
				const memo = {};
				try {
					PRESETS.forEach((p) => {
						const v = localStorage.getItem("gateway-config.baseURL." + p.route);
						if (v) memo[p.route] = v;
					});
				} catch (_e) { /* private mode etc. — non-fatal */ }
				return memo;
			});

			React.useEffect(() => {
				let cancelled = false;
				api.settings.describe().then((response) => {
					if (cancelled) return;
					const ok = response && response.ok;
					if (!ok) return;
					const ns = (response.value.namespaces || []).find((n) => n && n.ns === SETTINGS_NS);
					const providers = (ns && ns.value && ns.value.providers) || {};
					setKnownURLs((prev) => {
						const next = { ...prev };
						Object.keys(providers).forEach((r) => {
							const u = providers[r] && providers[r].baseURL;
							if (typeof u === "string" && u.trim()) next[r] = u.trim();
						});
						return next;
					});
				}).catch(() => {});
				return () => { cancelled = true; };
			}, [api]);

			// Switch the field with the route: the last-used address for that
			// route wins, then the preset's documented default, then empty.
			React.useEffect(() => {
				setBaseURL(knownURLs[route] || (preset && preset.baseURL) || "");
			}, [route, knownURLs]);

			const field = (label, value, onChange, placeholder, type) => React.createElement("label", { style: { ...fieldStyle, width: "100%", boxSizing: "border-box" } },
				React.createElement("span", { style: labelStyle }, label),
				React.createElement(Input, {
					value, type: type || "text", placeholder,
					onChange: (e) => onChange(e.target.value),
					style: { width: "100%", maxWidth: "none", boxSizing: "border-box" },
				}),
			);

			const fetchModels = async () => {
				if (busy) return;
				if (!isOAuth && !baseURL.trim()) {
					setMessage({ kind: "error", text: t("error.needBaseUrl") });
					return;
				}
				setBusy(true);
				setMessage(null);
				try {
					const response = await api.llm.discoverModels(SETTINGS_NS, isOAuth ? {
						provider: route,
					} : {
						provider: route,
						baseURL,
						api: "openai-completions",
						...(typedKey ? { apiKey: typedKey } : {}),
					});
					if (!response || !response.ok) {
						const err = ((response && response.error) || {});
						setMessage({ kind: "error", text: t("error.fetch", { error: err.message || t("common.unknown") }) });
						return;
					}
					const found = response.value;
					const chat = found.filter((m) => isChatModel(m.id));
					const keep = {};
					chat.forEach((m) => { keep[m.id] = true; });
					setModels(chat);
					setIncluded(keep);
					setFiltered(found.length - chat.length);
					const preferred = chat.find((m) => /deepseek/i.test(m.id)) || chat[0];
					setDefaultModel(preferred ? preferred.id : "");
					setEffort(preferred ? effortChoices(preferred.id)[0] : "off");
					if (!isOAuth) rememberBaseURL();
					setMessage({ kind: "ok", text: t("model.fetched", { total: found.length, filtered: found.length - chat.length }) });
				} catch (error) {
					setMessage({ kind: "error", text: t("error.fetch", { error: String((error && error.message) || error) }) });
				} finally {
					setBusy(false);
				}
			};

			const rememberBaseURL = () => {
				const url = baseURL.trim();
				setKnownURLs((prev) => (prev[route] === url ? prev : { ...prev, [route]: url }));
				try { localStorage.setItem("gateway-config.baseURL." + route, url); }
				catch (_e) { /* private mode etc. — non-fatal */ }
			};

			const applyConfig = async () => {
				if (busy || selectedModels.length === 0) return;
				if (!isOAuth && !baseURL.trim()) {
					setMessage({ kind: "error", text: t("error.nextBaseUrl") });
					return;
				}
				setBusy(true);
				setMessage(null);
				try {
					const ref = deriveKeyRef(route);
					const profile = {
						displayName: displayName.trim() || (known && known.displayName) || route.charAt(0).toUpperCase() + route.slice(1),
						...(isOAuth ? {} : { apiKeyEnv: ref, api: "openai-completions", baseURL }),
						// Keep native Codex Responses catalog capabilities intact. The
						// selected ids are enough to filter that installed catalog.
						models: selectedModels.map((m) => isOAuth ? { id: m.id } : {
							id: m.id,
							...(m.name ? { name: m.name } : {}),
							...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
							...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
							input: inputFor(m),
							reasoningEfforts: reasoningFor(m.id),
							compat: compatFor(m.id),
						}),
					};
					const ops = [];
					if (cleanup && !isOAuth) ops.push({ op: "unset", path: ["providers", "openai"] });
					ops.push({ op: "set", path: ["providers", route], value: profile });
					// Remote methods validate their argument count exactly, so the
					// optional `expectedRevision` must still be passed.
					const mutated = await api.settings.mutate(SETTINGS_NS, ops, undefined);
					if (!mutated || !mutated.ok) {
						const err = ((mutated && mutated.error) || {});
						setMessage({ kind: "error", text: t("error.writeConfig", { error: err.message || t("common.unknown") }) });
						return;
					}
					let keyNote = isOAuth ? t("oauth.savedGrant") : t("result.reuseKey", { ref });
					if (!isOAuth && typedKey) {
						const stored = await api.credentials.set(ref, typedKey);
						if (!stored || !stored.ok) {
							const err = ((stored && stored.error) || {});
							setMessage({ kind: "error", text: t("error.storeKey", { error: err.message || t("common.unknown") }) });
							return;
						}
						setStoredKey(true);
						keyNote = t("result.storedKey", { ref });
					} else if (!isOAuth && !storedKey) {
						setMessage({ kind: "error", text: t("error.noKey", { ref }) });
						return;
					}
					let defaultSaved = "";
					const chosenDefault = included[defaultModel] ? defaultModel : selectedModels[0] && selectedModels[0].id;
					if (chosenDefault) {
						const dm = await api.settings.mutate("agent-default-model", [
							{ op: "set", path: [], value: { provider: route, model: chosenDefault } },
						], undefined);
						if (dm && dm.ok) defaultSaved = t("result.defaultSaved");
					}
					if (!isOAuth) rememberBaseURL();
					setResult({
						route,
						displayName: profile.displayName,
						keyNote,
						count: selectedModels.length,
						skipped: models.length - selectedModels.length,
						filtered,
						defaultModel: chosenDefault || "",
						defaultSaved,
					});
					setStep(DONE_STEP);
				} catch (error) {
					setMessage({ kind: "error", text: t("error.write", { error: String((error && error.message) || error) }) });
				} finally {
					setBusy(false);
				}
			};

			const goNext = () => {
				if (step === 1) {
					if (!isOAuth && !baseURL.trim()) {
						setMessage({ kind: "error", text: t("error.nextBaseUrl") });
						return;
					}
					if (!hasAuth) {
						setMessage({ kind: "error", text: t("error.nextAuth") });
						return;
					}
					if (!isOAuth) rememberBaseURL();
				}
				if (step === 2) {
					if (models.length === 0) {
						setMessage({ kind: "error", text: t("error.fetchFirst") });
						return;
					}
					if (selectedModels.length === 0) {
						setMessage({ kind: "error", text: t("error.selectModel") });
						return;
					}
				}
				setMessage(null);
				setStep((s) => Math.min(s + 1, STEPS.length));
			};
			const goPrev = () => {
				setMessage(null);
				setStep((s) => Math.max(s - 1, 1));
			};
			const restart = () => {
				setResult(null);
				setMessage(null);
				setModels([]);
				setIncluded({});
				setFiltered(0);
				setDefaultModel("");
				setEffort("off");
				setApiKey("");
				setStep(1);
			};

			const onPickProvider = (value) => {
				setRoute(value);
				const picked = PRESETS.find((p) => p.route === value);
				setDisplayName(picked && picked.displayName && picked.displayName !== value ? picked.displayName : "");
				setCleanup(!(picked && picked.oauth));
				setOauthAnswer("");
			};

			const stepBar = React.createElement("div", {
				style: { display: "flex", gap: 6, alignItems: "center", margin: "8px 0 4px", fontSize: 12, color: "var(--dsw-alias-label-secondary)" },
			}, STEPS.map((label, i) => {
				const n = i + 1;
				const active = n === step;
				const done = n < step;
				return React.createElement("span", {
					key: label,
					style: {
						display: "inline-flex", alignItems: "center", gap: 4,
						padding: "3px 10px", borderRadius: 999,
						border: `1px solid ${active ? "var(--dsw-alias-border-l2)" : "transparent"}`,
						fontWeight: active ? 600 : 400,
						color: done ? "var(--dsw-alias-label-primary)" : active ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-tertiary)",
					},
				},
					React.createElement("span", null, done ? "✓" : `${n}`),
					React.createElement("span", null, label),
					n < STEPS.length ? React.createElement("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, "→") : null,
				);
			}));

			const nextDisabled = busy
				|| (step === 1 && ((!isOAuth && !baseURL.trim()) || !hasAuth))
				|| (step === 2 && (models.length === 0 || selectedModels.length === 0));

			const nav = (extra) => React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14 } },
				step > 1 ? React.createElement(Button, { variant: "outline", onClick: goPrev, disabled: busy }, t("common.previous")) : null,
				extra,
				step < STEPS.length ? React.createElement(Button, { variant: "primary", onClick: goNext, disabled: nextDisabled }, t("common.next")) : null,
			);

			let stepBody;
			if (step === DONE_STEP) {
				stepBody = [
					React.createElement("div", {
						key: "done",
						style: { ...fieldStyle, textAlign: "center", padding: "18px 0 6px" },
					},
						React.createElement("div", { style: { fontSize: 40, lineHeight: "48px" } }, "✅"),
						React.createElement("div", { style: { fontSize: 15, fontWeight: 500, color: "var(--dsw-alias-label-primary)", margin: "6px 0" } },
							t("result.success", { name: result.displayName, route: result.route })),
						React.createElement("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: "22px" } },
							t("result.detail", { count: result.count, skipped: result.skipped > 0 ? t("result.skipped", { count: result.skipped }) : "", filtered: result.filtered > 0 ? t("result.filtered", { count: result.filtered }) : "", credential: result.keyNote, defaultModel: result.defaultSaved ? t("result.default", { model: result.defaultModel }) : "" })),
					),
					React.createElement("div", { key: "actions", style: { display: "flex", gap: 8, justifyContent: "center", marginTop: 14 } },
						React.createElement(Button, { variant: "primary", onClick: restart }, t("result.again")),
					),
				];
			} else if (step === 1) {
				const oauthAttempt = oauth && oauth.attempt ? oauth.attempt : { state: "idle" };
				const oauthNotice = oauthAttempt.notice;
				const oauthPrompt = oauthAttempt.prompt;
				const oauthPanel = React.createElement("div", {
					key: "oauth", style: { ...fieldStyle, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "10px 12px" },
				},
					React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-primary)" } },
						oauth.configured ? t("oauth.signedIn") : t("oauth.title")),
					React.createElement("p", { style: { margin: "5px 0 8px", fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" } }, t("oauth.description")),
					React.createElement("div", { style: { display: "flex", gap: 8 } },
						React.createElement(Button, { variant: "primary", onClick: beginOauth, disabled: busy || !oauth.supported || oauthAttempt.state === "running" },
							oauth.configured ? t("oauth.signInAgain") : oauthAttempt.state === "running" ? t("oauth.waiting") : t("oauth.signIn")),
						oauthAttempt.state === "running" ? React.createElement(Button, { variant: "outline", onClick: cancelOauth }, t("common.cancel")) : null),
					!oauth.supported ? React.createElement("p", { style: { margin: "8px 0 0", fontSize: 12, color: "var(--dsw-alias-state-error-primary)" } }, t("oauth.unsupported")) : null,
					oauthNotice ? React.createElement("div", { style: statusStyle("ok") },
						React.createElement("div", null, oauthNotice.message || t("oauth.continue")),
						oauthNotice.code ? React.createElement("code", { style: { display: "block", fontSize: 18, margin: "6px 0" } }, oauthNotice.code) : null,
						oauthNotice.url ? React.createElement("a", { href: oauthNotice.url, target: "_blank", rel: "noreferrer" }, t("oauth.openPage")) : null) : null,
					oauthPrompt ? React.createElement("div", { style: fieldStyle },
						React.createElement("span", { style: labelStyle }, oauthPrompt.message),
						oauthPrompt.kind === "select"
							? React.createElement("select", { value: oauthAnswer, onChange: (e) => setOauthAnswer(e.target.value), style: selectStyle },
								React.createElement("option", { value: "" }, t("common.choose")),
								...(oauthPrompt.options || []).map((option) => React.createElement("option", { key: option.id, value: option.id }, option.label)))
							: React.createElement(Input, { value: oauthAnswer, type: oauthPrompt.kind === "secret" ? "password" : "text", placeholder: oauthPrompt.placeholder || "", onChange: (e) => setOauthAnswer(e.target.value) }),
						React.createElement(Button, { variant: "outline", onClick: answerOauth, disabled: !oauthAnswer.trim(), style: { marginTop: 8 } }, t("common.submit"))) : null,
					oauthAttempt.state === "failed" ? React.createElement("p", { style: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12 } }, oauthAttempt.error || t("oauth.failed")) : null,
				);
				stepBody = [
					isOAuth ? oauthPanel : field(storedKey ? t("field.apiKeySaved", { ref: deriveKeyRef(route) }) : t("field.apiKey"), apiKey, setApiKey, storedKey ? t("field.apiKeyReuse") : "sk-...", "password"),
					isOAuth ? null : field(t("field.baseUrl"), baseURL, setBaseURL, "https://gateway.example/v1"),
					React.createElement("label", { key: "provider", style: fieldStyle },
						React.createElement("span", { style: labelStyle }, t("field.provider")),
						React.createElement("select", {
							value: route,
							onChange: (e) => onPickProvider(e.target.value),
							style: selectStyle,
						},
							PRESETS.map((p) => React.createElement("option", { key: p.route, value: p.route },
								`${p.route}（${p.displayName}）`)),
						),
					),
					field(t("field.displayName"), displayName, setDisplayName, (known && known.displayName) || ""),
					nav(null),
				];
			} else if (step === 2) {
				stepBody = [
					nav(React.createElement(Button, {
						key: "fetch",
						variant: "outline",
						onClick: fetchModels,
						disabled: busy || !hasAuth || (!isOAuth && !baseURL.trim()),
					}, busy ? t("model.fetching") : t("model.fetch"))),
					models.length > 0
						? React.createElement("div", { key: "list", style: { ...fieldStyle, maxHeight: 260, overflowY: "auto", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "6px 10px" } },
							React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
								React.createElement("span", { style: { ...labelStyle, flex: 1 } },
									t("model.list", { selected: selectedModels.length, total: models.length })),
								bulkButton(t("model.none"), () => setAllModels(false)),
								bulkButton(t("model.all"), () => setAllModels(true)),
							),
							models.map((m) => React.createElement("div", {
								key: m.id,
								style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, lineHeight: "26px" },
							},
								React.createElement("input", {
									type: "checkbox",
									checked: Boolean(included[m.id]),
									onChange: (e) => toggleModel(m.id, e.target.checked),
								}),
								React.createElement("input", {
									type: "radio",
									name: "gateway-config-default-model",
									checked: defaultModel === m.id,
									disabled: !included[m.id],
									onChange: () => { setDefaultModel(m.id); setEffort(effortChoices(m.id)[0]); },
									title: t("model.defaultTitle"),
								}),
								React.createElement("span", { style: { color: "var(--dsw-alias-label-primary)", wordBreak: "break-all" } },
									`${m.name || m.id} · ${capabilityNote(m, t)}`),
							)),
						)
						: React.createElement("p", { key: "hint", style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, margin: "10px 0 0" } },
							t("model.hint")),
					defaultModel
						? React.createElement("label", { key: "effort", style: fieldStyle },
							React.createElement("span", { style: labelStyle }, t("model.effort")),
							React.createElement("select", {
								value: effort,
								onChange: (e) => setEffort(e.target.value),
								style: selectStyle,
							}, effortChoices(defaultModel).map((level) => React.createElement("option", { key: level, value: level }, level))),
						)
						: null,
				];
			} else {
				const chosenDefault = included[defaultModel] ? defaultModel : selectedModels[0] && selectedModels[0].id;
				const shown = selectedModels.slice(0, 8).map((m) => m.id).join(", ");
				const more = selectedModels.length > 8 ? t("summary.more", { count: selectedModels.length }) : "";
				stepBody = [
					React.createElement("div", { key: "summary", style: { ...fieldStyle, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "10px 12px" } },
						summaryRow("Provider", `${route}（${displayName.trim() || (known && known.displayName) || route}）`),
						isOAuth ? summaryRow(t("summary.auth"), t("summary.oauth")) : summaryRow("Base URL", baseURL),
						isOAuth ? null : summaryRow("API key", storedKey ? `${deriveKeyRef(route)} ${t(typedKey ? "summary.keyUpdate" : "summary.keyReuse")}` : typedKey ? t("summary.keyStore", { ref: deriveKeyRef(route) }) : t("summary.notProvided")),
						summaryRow(t("summary.models"), t("summary.modelsValue", { count: selectedModels.length, shown, more })),
						summaryRow(t("summary.filtered"), t("summary.filteredValue", { count: filtered })),
						summaryRow(t("summary.defaultModel"), chosenDefault ? t("summary.effort", { model: chosenDefault, effort }) : t("summary.notSelected")),
					),
					isOAuth ? null : React.createElement("label", { key: "cleanup", style: { display: "flex", alignItems: "center", gap: 6, margin: "12px 0 0", fontSize: 13, color: "var(--dsw-alias-label-secondary)" } },
						React.createElement("input", { type: "checkbox", checked: cleanup, onChange: (e) => setCleanup(e.target.checked) }),
						t("summary.cleanup"),
					),
					nav(React.createElement(Button, {
						key: "apply",
						variant: "primary",
						onClick: applyConfig,
						disabled: busy || selectedModels.length === 0,
					}, busy ? t("import.importing") : t("import.action"))),
				];
			}

			const status = message
				? React.createElement("div", { style: statusStyle(message.kind) }, message.text)
				: null;

			return React.createElement("div", { style: { maxWidth: 560 } },
				React.createElement("div", { style: { fontSize: 16, fontWeight: 500, lineHeight: "24px", color: "var(--dsw-alias-label-primary)", margin: 0 } },
					step === DONE_STEP ? t("section.doneTitle") : t("section.title", { step })),
				stepBar,
				...stepBody,
				status,
			);
		}

		// `connection.api` was a 0.1.x convenience bundle of the Host Remote
		// namespaces. 0.2.0 exposes each namespace as its own Cordis service
		// (`remote.<namespace>`) with positional arguments and a flat
		// `{ ok, value } | { ok: false, error }` envelope.
		const inject = ["slots", "connection", "locale", "remote.credentials", "remote.llm", "remote.settings"];

		function apply(ctx) {
			const slots = ctx.get("slots");
			const connection = ctx.get("connection");
			const locale = ctx.get("locale");
			const credentials = ctx.get("remote.credentials");
			const llm = ctx.get("remote.llm");
			const settings = ctx.get("remote.settings");
			if (slots === void 0 || connection === void 0 || locale === void 0
				|| credentials === void 0 || llm === void 0 || settings === void 0) return;
			const api = { credentials, llm, settings };
			ctx.effect(() => locale.register("gateway-config", { zh: flattenDictionary(zh), en: flattenDictionary(en) }), "gateway-config.locale");
			const t = locale.bind("gateway-config");
			const callOauth = (endpoint, payload) => connection.rpc.call("/gateway-oauth", endpoint, payload);
			const oauthRemote = {
				status: (providerId) => callOauth("status", { providerId }),
				begin: (providerId, method) => callOauth("begin", { providerId, method }),
				answer: (providerId, promptId, value) => callOauth("answer", { providerId, promptId, value }),
				cancel: (providerId) => callOauth("cancel", { providerId }),
			};
			slots.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: "gateway-config",
				order: 30,
				label: () => t("section.label"),
				inject: () => ({ api, oauthRemote, t }),
			}, GatewaySection));
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
