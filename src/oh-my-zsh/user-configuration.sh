alias zshconfig="nano ~/.zshrc"
alias reload=". ~/.zshrc && echo 'ZSH config reloaded from ~/.zshrc'"

alias cls="clear"
alias cgst="clear;gst"
alias cgstb="clear;gst;git branch"
alias nu="fnm use"
alias nurc="echo \"$1\" > .nvmrc"
alias node_modules_info="find . -name \"node_modules\" -type d -prune | xargs du -chs"
alias node_modules_rm="find . -name \"node_modules\" -type d -prune -exec rm -rf '{}' +"
alias gdf="git dsf"

gpl(){
  git checkout $1; git pull -p; git branch --merged | grep -v \* | grep -v master | grep -v main | xargs -n1 git branch -d
}
