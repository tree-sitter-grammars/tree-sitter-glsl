#! /bin/sh
#
# generate-highlight.sh
# Copyright (C) 2022 Stephan Seitz <stephan.seitz@fau.de>
#
# Distributed under terms of the GPLv3 license.
#

OUTPUT=queries/highlights.scm
curl -L "https://raw.githubusercontent.com/tree-sitter/tree-sitter-c/master/queries/highlights.scm" > $OUTPUT
curl -L "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/master/queries/glsl/highlights.scm" >> $OUTPUT
cat $OUTPUT
