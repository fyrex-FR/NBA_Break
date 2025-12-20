#!/bin/bash
echo "🏀 Construction de l'image Docker pour Synology..."

# 1. Build the image locally (using linux/amd64 platform if the NAS is Intel, or standard build)
# Most Synology NAS capable of Docker are x86_64 (Intel).
# Note: The user mentioned DS413+ (PPC) but claims to have Docker. 
# If it's a newer model (Intel), this standard build works. 
# If it's effectively PPC, Docker shouldn't be there.
# We'll assume standard architecture (amd64) since they have the Docker package.

docker build -t card-optimizer:latest .

echo "💾 Sauvegarde de l'image dans un fichier 'card-optimizer.tar'..."
docker save -o card-optimizer.tar card-optimizer:latest

echo "✅ Terminé !"
echo "-----------------------------------------------------"
echo "Instructions :"
echo "1. Prenez le fichier 'card-optimizer.tar' qui vient d'être créé."
echo "2. Allez sur votre Synology > Docker > Image > Ajouter > Depuis un fichier."
echo "3. Sélectionnez ce fichier."
echo "4. Une fois chargé, lancez le conteneur en mappant le port 8501."
echo "-----------------------------------------------------"
