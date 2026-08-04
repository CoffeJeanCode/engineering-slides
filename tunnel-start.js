const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3123;
console.log(`Iniciando Cloudflare Tunnel apuntando al puerto ${PORT}...`);

// Se usa npx para descargar automáticamente el binario si no está instalado
const tunnel = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], { shell: true });

let serverStarted = false;

tunnel.stderr.on('data', (data) => {
  const output = data.toString();
  // Mostrar los logs en la consola para depuración
  process.stdout.write(output); 

  // Buscar la URL dinámica generada (ej. https://random-words.trycloudflare.com)
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !serverStarted) {
    serverStarted = true;
    const publicUrl = match[0];
    
    console.log(`\n==============================================`);
    console.log(` TÚNEL ESTABLECIDO`);
    console.log(` URL Pública: ${publicUrl}`);
    console.log(`==============================================\n`);
    
    // Inyectar en las variables de entorno del proceso
    process.env.PUBLIC_URL = publicUrl;
    
    // Iniciar el servidor Express que consumirá esta variable
    console.log('Iniciando el servidor Node.js...');
    require('./server.js');
  }
});

tunnel.on('error', (err) => {
  console.error('Error al iniciar cloudflared:', err.message);
  console.error('Asegúrate de tener cloudflared instalado y en el PATH de tu sistema.');
});

tunnel.on('close', (code) => {
  console.log(`El túnel se cerró con el código ${code}`);
  process.exit(code || 0);
});
