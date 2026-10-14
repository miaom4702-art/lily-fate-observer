/* config.js —— 联机服务器地址（可选，一般不用改）
 *
 * 情况一：你把游戏部署到了云端（服务器同时托管了网页）。
 *         玩家直接打开你的网址，程序会自动连同一个服务器，这里留空即可。
 *
 * 情况二：你想让网页版统一连某个固定服务器（比如把自己部署的地址发给别人，
 *         让大家直接双击 index.html 也能联机），在这里填上，例如：
 *             window.GAME_CONFIG = { server: "wss://lily-fate-server.onrender.com" };
 *
 * 情况三：局域网内自己玩，留空即可 —— 在大厅「服务器」里填 ws://房主IP:8787。
 */
window.GAME_CONFIG = window.GAME_CONFIG || { server: "" };
