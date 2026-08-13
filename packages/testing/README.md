# Testing

`@unilab/testing` 提供跨 package 的测试构造器、固定时钟、测试 Services 和断言辅助。
它只服务测试，不定义生产协议或业务默认值。

## 原则

- fixture 必须显式说明来源、单位和缺失能力。
- Services fake 应实现与生产端口相同的类型，并默认 fail closed。
- 可复用 builder 生成最小有效对象；特定 E2E 数据留在对应测试目录。
- 对 3D、尺寸和坐标的测试应来自真实模型元数据或明确的合成 fixture。

## 绝对不能做

- 不得让生产代码导入本包。
- 不得通过 fake 自动填充生产服务缺失的 site、placement、模型或能力。
- 不得把某个 `plr_test` 的相机、缩放、路径或尺寸变成全局默认值。

## 验证

```bash
pnpm --filter @unilab/testing typecheck
```
