import * as d3 from 'd3';
import * as pathTool from 'zrender/src/tool/path';
import * as THREE from 'three';
import geo from './geo';
import Point from './point';

export default function three_draw(dom, geojson, testData) {
   let width = getSize(dom.style.width);
   let heigth = getSize(dom.style.height);

   let scene = new THREE.Scene();
   let camera = new THREE.PerspectiveCamera(45, width / heigth, 0.1, 2000);
   camera.position.set(200, 300, 800);
   // camera.position.set(-500, 300, 800);
   // camera.lookAt(200, 300, 0);

   let renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
   renderer.setSize(width, heigth);
   renderer.setClearColor(new THREE.Color(0, 0, 0));
   dom.appendChild(renderer.domElement);
   loop();

   let axesHelper = new THREE.AxesHelper(1000);
   scene.add(axesHelper);

   let geoBounds;
   let { projection, paths } = geo(geojson);
   paths.forEach(path => {
      let pathProxy = pathTool.createPathProxyFromString(path);
      geoBounds = pathProxy.getBoundingRect();
      let pathData = pathProxy.data;

      let step = 1;
      let geoShape = new THREE.Shape();

      for(let i = 0; i < pathData.length; i += step) {
         if(i == 0) {
            geoShape.moveTo(pathData[i + 1], pathData[i + 2]);
            step = 3;
         }
         else {
            if(pathData[i] == 2) {
               geoShape.lineTo(pathData[i + 1], pathData[i + 2]);
            }
         }

         // @test 是否都是正值
         // if(pathData[i+1]<0||pathData[i+2]<0){
         //    console.log(pathData[i+1], pathData[i+2]);
         // }
      }

      let geoGeometry = new THREE.ShapeBufferGeometry(geoShape);
      let geoMaterial = new THREE.ShaderMaterial({
         vertexShader: `
             void main() {
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
                gl_PointSize = 10.0;
             }
         `,
         fragmentShader: `
             precision mediump float;

             void main() {
               gl_FragColor = vec4(1.0, 1.0, 0.0, 0.7);
             }
         `,
         side: THREE.DoubleSide
      });
      let mesh = new THREE.Mesh(geoGeometry, geoMaterial);

      // mesh.rotation.x = -Math.PI / 6;
      scene.add(mesh);
   });


   let positions = [];
   let colors = [];

   let pointsGeometry = new THREE.BufferGeometry();
   let color = new THREE.Color();

   testData.sumPre.forEach(s => {
      let pos = projection([s.lon, s.lat]);

      let x = pos[0];
      let y = pos[1];
      let z = s.sum_pre;

      let vx = x / 500;
      let vy = y / 500;
      let vz = 1.0;
      color.setRGB(vx, vy, vz);
      colors.push(color.r, color.g, color.b);
      // positions.push(pos[0], pos[1], 20);
      positions.push(pos[0], pos[1], z * 20);
   });

   pointsGeometry.addAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
   pointsGeometry.addAttribute("a_color", new THREE.Float32BufferAttribute(colors, 3));

   let pointMaterial = new THREE.ShaderMaterial({
      vertexShader: `
         float parseColor(vec3 color);

         attribute vec3 a_color;
         varying vec3 v_color;

         void main() {
            v_color = a_color;
            gl_PointSize = 10.0;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
            // gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position[0], position[1], parseColor(a_color), 1.0 );
         }

         // parse vec3 color to num.
         float parseColor(vec3 color) {
            float numColor = color[0] * 255.0 * color[1] * 255.0 * color[2] * 255.0;
            return numColor / 50000.0;
         }
      `,
      fragmentShader: `
         precision mediump float;
         varying vec3 v_color;

         void main() {
            if(distance(gl_PointCoord, vec2(0.5, 0.5)) > 0.5) {
               discard;
            }
            else {
               gl_FragColor = vec4(v_color, 1.0);
            }
         }
      `,
      vertexColors: THREE.VertexColors
   });

   let points = new THREE.Points(pointsGeometry, pointMaterial);
   scene.add(points);

   //  创建网格
   let geoWidth = geoBounds.width;
   let geoHeight = geoBounds.height;
   let geoX = geoBounds.x;
   let geoY = geoBounds.y;

   let gridSize = Math.floor(Math.min(geoWidth / 3, geoHeight / 3)); // 网格大小
   let positionArr = [];

   for(let i = 0; i < positions.length; i += 3) {
      positionArr.push(
         [positions[i], positions[i + 1], positions[i + 2]]
      );
   }

   function meshFunction(u0, v0, dest) {
      let result = dest || new THREE.Vector3();
      let u = geoWidth * u0 + geoX;
      let v = geoHeight * v0 + geoY;

      let x = u;
      let y = v;

      let point = new Point(x, y);
      point.standPoints = positionArr;
      let z = point.getZValue();  //根据反距离权重插值计算高程  

      if(isNaN(x) || isNaN(y) || isNaN(z)) {
         result.x = 0;
         result.y = 0;
         result.z = 0;
      }
      else {
         result.x = x;
         result.y = y;
         result.z = z;
      }

      return result;
   };

   let palneGeometry = new THREE.ParametricGeometry(meshFunction, gridSize, gridSize);
   let planeMaterial = new THREE.ShaderMaterial({
      vertexShader: `
         varying vec3 pos;

         void main() {
            pos = position;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4( position, 1.0 );
         }
      `,
      fragmentShader: `
         precision mediump float;

         varying vec3 pos;

         void main() {
            gl_FragColor = vec4(pos / 500.0, 1.0);
         }
      `,
      side: THREE.DoubleSide,
      // wireframe: true
   });
   let planeMesh = new THREE.Mesh(palneGeometry, planeMaterial);
   scene.add(planeMesh);

   // ************************

   function loop() {
      requestAnimationFrame(loop);
      scene.rotation.y += 0.01;
      renderer.render(scene, camera);
   }
}

function getSize(size) {
   return Number(size.replace('px', ''));
}

