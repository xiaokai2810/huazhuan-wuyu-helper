# 花砖物语对局助手

线上地址：[GitHub Pages](https://xiaokai2810.github.io/huazhuan-wuyu-helper/)。

双击 [花砖物语助手.html](花砖物语助手.html) 即可在浏览器里使用。它是单文件，离线可用。

## 快速录入

1. 选中一种颜色（键盘 `1`–`5`），点击每个工厂的砖格。按 `0` 选橡皮，或右键砖格清空。
2. 用中央区的 `+`、`−` 填入各颜色数量，勾选先手标记是否还在。
3. 选中颜色，点击自己图案线上的第 N 格，表示这行已有 N 块该色砖；点击墙格标记已经贴好的砖。
4. 如需估计对手下一手，勾选“录入一位对手”并录入其棋盘。多人局建议录入最可能影响你的一位。
5. 右边实时显示推荐拿砖、落点、本轮成墙得分和新增地板扣分。

“填入示例”可以先体验操作。局面会尽可能保存在当前浏览器的本地存储里。

## 计算范围

- 使用原版 Azul 彩色墙的工厂取砖、中央区、先手标记、图案线、贴墙得分和地板扣分规则。
- 枚举当前所有合法拿砖与落点，按本轮得分、未完成图案线的价值和可选的对手下一手排序。
- 这是局面启发式建议，不保证最优；它不会读取微信画面或自动点击小程序。
- 小程序如启用了灰墙等变体，当前版本的建议不适用。

规则参考：[Next Move Games 官方 Azul 说明书](https://cdn.svc.asmodee.net/production-nextmove/uploads/sites/4/2024/06/EN-Azul-Rules-Next-Move-web.pdf)。

开发校验：在项目根目录执行 `node --test 交付/花砖物语助手/engine.test.js`。修改源文件后执行 `python3 交付/花砖物语助手/build_standalone.py` 更新单文件版本。

重新发布：在具备 GitHub 凭据的本机执行 `/Users/orange/.codex/global/run-with-env shadow-blade -- python3 deploy_pages.py`。
