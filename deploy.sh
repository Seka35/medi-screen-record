#!/bin/bash
# Script de déploiement pour le VPS

echo "Mise à jour des dépendances..."
npm install

echo "Configuration de l'environnement..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env créé. Veuillez le configurer avant de continuer si vous souhaitez changer les identifiants par défaut."
fi

# Création du dossier uploads
mkdir -p uploads

echo "Redémarrage de l'application via PM2..."
pm2 restart media-screen-recorder || pm2 start server.js --name "media-screen-recorder"

echo "Déploiement terminé. Assurez-vous que votre Nginx est configuré pour écouter media.futurvps.pro et faire un proxy_pass vers http://localhost:3042"
