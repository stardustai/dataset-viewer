use dataset_viewer_lib::create_specta_builder;
use specta_typescript::Typescript;

fn main() {
    let builder = create_specta_builder();

    builder
        .export(
            Typescript::default()
                .formatter(specta_typescript::formatter::prettier)
                .header("// @ts-nocheck"),
            "../src/types/tauri-commands.ts",
        )
        .expect("Failed to export TypeScript bindings");

    println!("TypeScript bindings exported successfully!");
}
