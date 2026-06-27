import csv from "../../../../data/users.csv?raw"

export interface User {
  user_id: string
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let value = ""
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === "\"" && quoted && next === "\"") {
      value += "\""
      index += 1
      continue
    }

    if (char === "\"") {
      quoted = !quoted
      continue
    }

    if (char === "," && !quoted) {
      values.push(value)
      value = ""
      continue
    }

    value += char
  }

  values.push(value)
  return values
}

export function parseUsers(rawCsv: string): User[] {
  const [headerLine, ...rows] = rawCsv.trim().split(/\r?\n/)
  const headers = parseCsvLine(headerLine)

  return rows
    .filter(Boolean)
    .map((row) => {
      const values = parseCsvLine(row)
      const item = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      ) as Record<string, string>

      return {
        user_id: item.user_id,
      }
    })
}

export const users = parseUsers(csv)
