import { execFileSync } from "node:child_process";

/** 已审定且默认可复现的 F05 OS 产品基线 Git 提交。 */
export const F05_DEFAULT_OS_REVISION =
  "cd17e040ea7bfe4070a556f5a9576d7ce42433f3";

const EXACT_GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;

export interface GitRevisionEvidence {
  sha: string;
  dirty: boolean;
}

/**
 * 读取仓库精确 Git 修订证据。
 *
 * 参数：`repository` 是待核验仓库根目录。
 * 返回：当前完整提交 SHA 与工作树是否存在未提交修改。
 * 异常：目录不是 Git 仓库或 Git 命令失败时原样抛出。
 */
export function readGitRevision(repository: string): GitRevisionEvidence {
  return {
    sha: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    }).trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repository,
        encoding: "utf8",
      }).trim().length > 0,
  };
}

/**
 * 解析真实 OS 端到端测试（E2E Test）期望的精确 Git 修订。
 *
 * 参数：`environment` 是显式注入的环境变量读模型；未声明
 * `UNILAB_AUTHORING_OS_REVISION` 时使用已审定产品基线。
 * 返回：未经裁剪或改写的完整小写 40 位 Git SHA。
 * 异常：覆盖值为空、含空白、长度不完整、包含非十六进制字符或大小写漂移时
 * 抛出 `Error`，禁止把脏输入解释为任意提交或跳过工作树校验。
 */
export function resolveExpectedF05OsRevision(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  // ``configuredRevision`` 是调用方明确授权本轮验收的候选提交身份。
  const configuredRevision = environment.UNILAB_AUTHORING_OS_REVISION;
  if (configuredRevision === undefined) return F05_DEFAULT_OS_REVISION;
  if (!EXACT_GIT_REVISION_PATTERN.test(configuredRevision)) {
    throw new Error(
      "UNILAB_AUTHORING_OS_REVISION 必须是完整小写 40 位 Git SHA",
    );
  }
  return configuredRevision;
}
