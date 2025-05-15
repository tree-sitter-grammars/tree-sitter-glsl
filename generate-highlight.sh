#! /bin/sh
#
# generate-highlight.sh
# Copyright (C) 2022 Stephan Seitz <stephan.seitz@fau.de>
#
# Distributed under terms of the MIT license.
#

printf '%s\n\n%s\n' \
  "$(curl -LSs "https://raw.githubusercontent.com/tree-sitter/tree-sitter-c/master/queries/highlights.scm")" \
  "$(curl -LSs "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/glsl/highlights.scm")" | \
  sed 's/lua-match/match/' | tee queries/highlights.scm
