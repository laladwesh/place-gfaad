import { spawn } from "node:child_process";

interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
  redactValues?: string[];
  onOutput?: (line: string) => Promise<void> | void;
}

function redactText(value: string, redactValues: string[] = []): string {
  return redactValues.reduce((acc, needle) => {
    if (!needle) {
      return acc;
    }

    return acc.split(needle).join("***");
  }, value);
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let aggregatedOutput = "";
    const onLine = async (raw: string) => {
      const output = redactText(raw, options.redactValues);
      aggregatedOutput += `${output}\n`;
      if (options.onOutput) {
        await options.onOutput(output);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      void onLine(chunk.toString("utf8").trimEnd());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      void onLine(chunk.toString("utf8").trimEnd());
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve(aggregatedOutput.trim());
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}
