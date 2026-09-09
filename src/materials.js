import * as THREE from 'three';

// Generated limestone albedo is triplanar mapped: articulated GLBs need no UVs.
let limestone;
function limestoneTexture() {
  if (!limestone) {
    limestone = new THREE.TextureLoader().load('/textures/limestone-albedo.png');
    limestone.wrapS = limestone.wrapT = THREE.RepeatWrapping;
    limestone.colorSpace = THREE.SRGBColorSpace;
    limestone.anisotropy = 4;
  }
  return limestone;
}
const noise = `
float hash3(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.55+noise3(p*2.03)*.27+noise3(p*4.09)*.13+noise3(p*8.17)*.05;}
`;
// The cape is carved stone, not a metal fabric overlay. Filter in link-space
// before fract() so tiny links converge to a quiet average instead of sparkling.
const carvedMail = `
float stoneLinks(vec2 uv){
  vec2 p=uv*22.;
  vec2 footprint=fwidth(p);
  float pixel=max(footprint.x,footprint.y);
  p.x+=mod(floor(p.y),2.)*.5;
  float ring=abs(length((fract(p)-.5)*vec2(1.,1.3))-.33);
  float aa=max(pixel*.65,.012);
  float relief=1.-smoothstep(.055-aa,.055+aa,ring);
  return mix(relief,.24,smoothstep(.3,.85,pixel));
}
`;
export function stoneMaterial(
  color,
  { board = false, dark = false, trim = false, mail = false } = {},
) {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness: board ? 0.24 : mail ? 0.82 : 0.88,
    metalness: board ? 0.12 : 0.0,
    clearcoat: board ? 0.8 : 0,
    clearcoatRoughness: board ? 0.18 : 0.9,
  });
  m.onBeforeCompile = (s) => {
    s.uniforms.limestoneAlbedo = { value: limestoneTexture() };
    s.vertexShader =
      'varying vec3 vStone;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvStone=${board ? '(modelMatrix*vec4(position,1.0)).xyz' : 'position'};`,
      );
    s.fragmentShader =
      'uniform sampler2D limestoneAlbedo;\nvarying vec3 vStone;\n' +
      noise +
      (mail ? carvedMail : '') +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 sp=vStone*${board ? '1.6' : '5.5'};
      float n=fbm(sp*1.8);
      float vein=pow(1.-abs(sin(sp.x*2.3+sp.z*1.4+sp.y*.8+fbm(sp*.72)*9.)),14.);
      float fine=noise3(sp*35.);
      diffuseColor.rgb*=mix(.76,1.18,n)*mix(.91,1.05,fine);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*${dark ? '2.3' : '.38'},vein*${board ? '.65' : '.32'});
      ${
        board
          ? ''
          : `vec3 weights=abs(normalize(cross(dFdx(vStone),dFdy(vStone))));
      weights=pow(weights,vec3(4.));weights/=max(dot(weights,vec3(1.)),.0001);
      vec3 grain=texture2D(limestoneAlbedo,vStone.yz*.65).rgb*weights.x+texture2D(limestoneAlbedo,vStone.xz*.65).rgb*weights.y+texture2D(limestoneAlbedo,vStone.xy*.65).rgb*weights.z;
      diffuseColor.rgb*=clamp(grain*2.0,vec3(.48),vec3(1.2));`
      }
      ${
        mail
          ? `vec3 linkWeights=abs(normalize(cross(dFdx(vStone),dFdy(vStone))));
      linkWeights=pow(linkWeights,vec3(4.));linkWeights/=max(dot(linkWeights,vec3(1.)),.0001);
      float mailRelief=stoneLinks(vStone.zy)*linkWeights.x+stoneLinks(vStone.xz)*linkWeights.y+stoneLinks(vStone.xy)*linkWeights.z;
      diffuseColor.rgb*=mix(.91,1.035,mailRelief);`
          : ''
      }
    `,
    );
    s.fragmentShader = s.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float grit=noise3(vStone*${board ? '12.' : '24.'});
      normal=normalize(normal+vec3(dFdx(grit),dFdy(grit),0.)*.035);
    `,
    );
  };
  m.customProgramCacheKey = () => `stone-${board}-${dark}-${trim}-${mail}-limestone-v2`;
  return m;
}

export function makeMaterials() {
  return {
    ivory: stoneMaterial('#89939d'),
    sapphire: stoneMaterial('#303f52', { dark: true }),
    ivoryTrim: stoneMaterial('#7c817e', { trim: true }),
    sapphireTrim: stoneMaterial('#46596b', { trim: true, dark: true }),
    ivoryMail: stoneMaterial('#838d97', { mail: true }),
    sapphireMail: stoneMaterial('#2e3d4f', { mail: true, dark: true }),
    ivoryInterior: new THREE.MeshStandardMaterial({
      color: '#909da8',
      roughness: 1,
      flatShading: true,
    }),
    sapphireInterior: new THREE.MeshStandardMaterial({
      color: '#536276',
      roughness: 1,
      flatShading: true,
    }),
    recess: new THREE.MeshStandardMaterial({ color: '#111c29', roughness: 0.85 }),
    whiteTile: stoneMaterial('#8295a3', { board: true }),
    blueTile: stoneMaterial('#042f55', { board: true, dark: true }),
    architecture: stoneMaterial('#28323c'),
    border: stoneMaterial('#364452'),
    metal: new THREE.MeshStandardMaterial({ color: '#756746', roughness: 0.4, metalness: 0.65 }),
  };
}
