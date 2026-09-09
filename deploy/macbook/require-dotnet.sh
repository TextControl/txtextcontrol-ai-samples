#!/bin/bash
# Shared, read-only preflight. Run before starting containers or changing local state.
require_dotnet() {
  DOTNET_HOST="$(command -v dotnet)" || {
    echo 'Install the ARM64 .NET 8 SDK once: brew install --cask dotnet-sdk@8' >&2
    return 1
  }
  local host_info runtimes
  host_info="$(DOTNET_CLI_UI_LANGUAGE=en-US "$DOTNET_HOST" --info)" || {
    echo 'The installed dotnet host cannot start. Check the Microsoft ARM64 .NET installation.' >&2
    return 1
  }
  if ! printf '%s\n' "$host_info" | grep -Eq 'Architecture:[[:space:]]+arm64'; then
    echo 'An ARM64 dotnet host is required. Use the Microsoft ARM64 .NET 8 SDK, outside Rosetta.' >&2
    return 1
  fi
  runtimes="$("$DOTNET_HOST" --list-runtimes)" || return 1
  if ! printf '%s\n' "$runtimes" | grep -Eq '^Microsoft.NETCore.App 8\.' ||
     ! printf '%s\n' "$runtimes" | grep -Eq '^Microsoft.AspNetCore.App 8\.'; then
    echo 'Both .NET 8 and ASP.NET Core 8 ARM64 runtimes are required. Install: brew install --cask dotnet-sdk@8' >&2
    return 1
  fi
}
