import {
  GithubDatabaseEntry,
  encode,
  args,
  EarlyExitFlag,
  Option,
  FiniteNumber,
  Choice,
  PARSE_FAILURE,
  red,
  BinaryFlag,
} from "./deps.ts";
import { consoleTable } from "./console_table.ts";
import { generateTsvFile } from "./tsv_file_creator.ts";
import { generateMarkdownFile } from "./markdown_file_creator.ts";
import { sortOrderByDesc as sortOrderByDesc } from "./src/sort.ts";
import { unique } from "./src/unique.ts";
import { Repository } from "./src/Repository.ts";
import { concurrentPromise } from "./src/concurrentPromise.ts";
import { resoinseDenoWebsiteGithub } from "./github.ts";
import { green } from "./deps.ts";
import { Text } from "https://deno.land/x/args@2.0.2/value-types.ts";

const Tsv = "tsv";
const Table = "table";
const MarkdownFile = "markdown";
type Format = typeof Tsv | typeof Table | typeof MarkdownFile;

const parser = args
  .describe("Add or subtract two numbers")
  .with(
    EarlyExitFlag("help", {
      describe: "Show help",
      alias: ["h"],
      exit() {
        console.log(parser.help());
        return Deno.exit();
      },
    }),
  )
  .with(
    Option("username", {
      type: Text,
      describe: "Github account username without '@'. required password",
      alias: ["u"],
    }),
  )
  .with(
    Option("password", {
      type: Text,
      describe: "Github account password. required username",
      alias: ["p"],
    }),
  )
  .with(
    Option("format", {
      type: Choice<Format>(
        {
          value: Tsv,
          describe: "Output tsv file",
        },
        {
          value: Table,
          describe: "Output console table",
        },
        {
          value: MarkdownFile,
          describe: "Output markdown file",
        },
      ),
      alias: ["f"],
      describe: "Choice output format",
    }),
  ).with(
    BinaryFlag("sampling", {
      describe: "For testing, fetch a little sample from API",
      alias: ["s", "test"],
    }),
  );

const res = parser.parse(Deno.args);

if (res.tag === PARSE_FAILURE) {
  console.error("Failed to parse CLI arguments");
  console.error(res.error.toString());
  Deno.exit(1);
}

const { username, password, format, sampling } = res.value;

if (username === undefined || password === undefined) {
  console.log(red("Needs to input both username and password."));
  Deno.exit(1);
}
if (format === undefined) {
  console.log(red("Needs to input output format."));
  Deno.exit(1);
}

console.debug(green(`Started. format = ${format}`));

const entries: Readonly<Record<string, GithubDatabaseEntry>> =
  await resoinseDenoWebsiteGithub.json();

const repositoryPromises: (() => Promise<Repository>)[] = [];

for (const key of Object.keys(entries)) {
  const fetchUrl = `https://api.github.com/repos/${entries[key].owner}/${
    entries[key].repo
  }`;

  repositoryPromises.push(() =>
    fetch(fetchUrl, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${encode(username + ":" + password)}`,
      },
    }).then((r) => r.json())
  );

  // For Manual Testing
  if (sampling && repositoryPromises.length > 3) {
    console.debug(green(`Sampling Success. sampling = ${sampling}`));
    break;
  }
}

// const repositories: Repository[] = await Promise.all(repositoryPromises);
const repositories: Repository[] = await concurrentPromise<Repository>(
  repositoryPromises,
  100,
);

// validation
const validRepositories: Repository[] = [];
for (const repository of repositories) {
  if (repository !== undefined && repository.name !== undefined) {
    validRepositories.push(repository);
  }
}

// sort
const sortedResult = sortOrderByDesc(validRepositories);

// unique
const uniquedRepositories = unique(sortedResult);

switch (format) {
  case Table:
    consoleTable(uniquedRepositories);
    break;
  case Tsv:
    await generateTsvFile(uniquedRepositories);
    break;
  case MarkdownFile:
    await generateMarkdownFile(uniquedRepositories);
    break;
}

console.debug(green(`End. format = ${format}`));
