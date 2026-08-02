# Device Action 手动解锁 E2E 证据

本证据集由 `e2e/device-manual-unlock-real-os.spec.ts` 通过独占的前端预览服务
与真实 Uni-Lab-OS FastAPI composition 生成。对应 OS 代码提交为
`bebc2128fe5ab6fd525e3d7c0f28c35691cced86`。

测试全程复用现有仪器设备页、Action 卡片、锁状态面板和二次确认框，只替换
服务适配及后端接口。顺序覆盖：

1. 通过 `GET /api/v1/devices` 检出被占用 Action；
2. 在原有设备 UI 展示完整 holder 和手动解锁入口；
3. 强制操作员确认物理安全；
4. 发送带 holder CAS 的 `force_unlock` 命令；
5. 重新拉取权威目录，确认 Action 已空闲；
6. 再次建立新 holder，确认解锁后可重新占用且迟到状态不会覆盖新 holder。

`network-ledger.json` 同时记录 E2E fixture 的 holder 建立/结束请求和浏览器发出的
health、目录、命令请求。账本断言产品链路没有调用 `/api/v1/runtime/runs*`、
workflow node template 或前端直连 Edge WebSocket。

这些截图证明逻辑锁恢复与重新占用；不证明物理设备已经停止，因此操作员安全确认
仍是强制步骤。
