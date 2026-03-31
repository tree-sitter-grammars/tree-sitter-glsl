; Version tags for constructs whose availability depends on GLSL version.
; These captures are intended for a post-parse validator, not syntax highlighting.

[
  "uint"
  "uvec2"
  "uvec3"
  "uvec4"
  "sampler1DArray"
  "sampler1DArrayShadow"
  "isampler1D"
  "isampler1DArray"
  "usampler1D"
  "usampler1DArray"
  "sampler2DArray"
  "sampler2DArrayShadow"
  "isampler2D"
  "isampler2DArray"
  "usampler2D"
  "usampler2DArray"
  "isampler3D"
  "usampler3D"
  "isamplerCube"
  "usamplerCube"
] @version-130

(interpolation_qualifier
  "noperspective" @version-130)

[
  "sampler2DRect"
  "sampler2DRectShadow"
  "isampler2DRect"
  "usampler2DRect"
  "samplerBuffer"
  "isamplerBuffer"
  "usamplerBuffer"
] @version-140

(layout_argument
  "shared" @version-140)

[
  "sampler2DMS"
  "isampler2DMS"
  "usampler2DMS"
  "sampler2DMSArray"
  "isampler2DMSArray"
  "usampler2DMSArray"
] @version-150

((layout_argument
   (identifier) @version-150)
 (#match? @version-150 "^(points|lines|triangles|max_vertices)$"))

[
  "double"
  "dvec2"
  "dvec3"
  "dvec4"
  "dmat2"
  "dmat3"
  "dmat4"
  "dmat2x2"
  "dmat2x3"
  "dmat2x4"
  "dmat3x2"
  "dmat3x3"
  "dmat3x4"
  "dmat4x2"
  "dmat4x3"
  "dmat4x4"
  "samplerCubeArray"
  "samplerCubeArrayShadow"
  "isamplerCubeArray"
  "usamplerCubeArray"
] @version-400

(precise_qualifier) @version-400

(storage_qualifier
  "patch" @version-400)

(storage_qualifier
  "sample" @version-400)

(storage_qualifier
  "subroutine" @version-400)

[
  "atomic_uint"
  "image1D"
  "iimage1D"
  "uimage1D"
  "image2D"
  "iimage2D"
  "uimage2D"
  "image3D"
  "iimage3D"
  "uimage3D"
  "imageCube"
  "iimageCube"
  "uimageCube"
  "imageBuffer"
  "iimageBuffer"
  "uimageBuffer"
  "image1DArray"
  "iimage1DArray"
  "uimage1DArray"
  "image2DArray"
  "iimage2DArray"
  "uimage2DArray"
  "imageCubeArray"
  "iimageCubeArray"
  "uimageCubeArray"
  "image2DRect"
  "iimage2DRect"
  "uimage2DRect"
  "image2DMS"
  "iimage2DMS"
  "uimage2DMS"
  "image2DMSArray"
  "iimage2DMSArray"
  "uimage2DMSArray"
] @version-420

(storage_qualifier
  "coherent" @version-420)

(storage_qualifier
  "volatile" @version-420)

(storage_qualifier
  "restrict" @version-420)

(storage_qualifier
  "readonly" @version-420)

(storage_qualifier
  "writeonly" @version-420)

(storage_qualifier
  "buffer" @version-430)

(storage_qualifier
  "shared" @version-430)

((layout_argument
   (identifier) @version-430)
 (#match? @version-430 "^(local_size_x|local_size_y|local_size_z)$"))
